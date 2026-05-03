// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IExtendedResolver} from "@ensdomains/resolvers/profiles/IExtendedResolver.sol";
import {ITextResolver} from "@ensdomains/resolvers/profiles/ITextResolver.sol";
import {IAddrResolver} from "@ensdomains/resolvers/profiles/IAddrResolver.sol";
import {INameWrapper} from "@ensdomains/wrapper/INameWrapper.sol";

/// @title  ZkmaResolver (v2 - sovereign org names + minted user subnames)
///
/// @notice Each organization owns its own `zkmemory-<orgname>.eth` on Sepolia/Mainnet.
///         The `zkmemory-` prefix is enforced at registration so anyone scanning ENS
///         can identify orgs that opted into the zkmemoryauthorization platform - it's not a
///         security claim, just a discoverability marker.
///
///         `registerOrg(label)`:
///           caller must already own (and have wrapped) `<label>.eth` AND must have
///           approved this contract as operator on NameWrapper. The contract sets its
///           own address as the org's resolver, marks the org as registered, and emits
///           an event so frontends can discover it.
///
///         `registerUser(orgNode, userLabel, userAddr, role, ns, maxTag, expiry)`:
///           org admin only. Mints a real wrapped subname `<userLabel>.<orgLabel>.eth`
///           to userAddr (so it shows up in ENS app, OpenSea, the user's wallet
///           inventory) AND records the policy data this resolver serves on text-record
///           reads.
///
///         Trust kernel:
///           - org admin = current `nameWrapper.ownerOf(uint256(orgNode))`
///           - userAddr is write-once at registration; admin cannot rotate it. The
///             per-request signature path in PRD §15.3 stays sound: even if admin is
///             compromised, they cannot impersonate a user without the user's wallet.
contract ZkmaResolver is IExtendedResolver, ITextResolver, IAddrResolver, IERC165 {
    INameWrapper public immutable nameWrapper;

    bytes32 public constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;
    string public constant REQUIRED_PREFIX = "zkmemory-";

    struct OrgData {
        string  label;        // the chosen org label without ".eth", e.g. "zkmemory-istanbulhospital"
        bool    registered;
    }

    struct UserData {
        address userAddr;
        string  role;
        string  namespaces;
        string  maxTag;
        uint64  expiry;
        bool    revoked;
        bool    exists;
        bytes32 proofCommitment;
        // keccak256(email) the org admin onboarded this user with. The gateway
        // hashes the JWT's email claim (revealed in the proof's public inputs)
        // and asserts it matches this value. Plain email is never stored, but
        // the hash + the JWT ties the proof to the admin's expected identity.
        bytes32 emailHash;
    }

    /// orgNode => OrgData
    mapping(bytes32 => OrgData) public orgs;
    /// orgNode => userLabelHash => UserData
    mapping(bytes32 => mapping(bytes32 => UserData)) public users;
    /// orgNode => userLabelHash => userLabel (string back-reference for indexers)
    mapping(bytes32 => mapping(bytes32 => string)) public userLabels;
    /// userNode (= namehash(orgNode, userLabelHash)) => (orgNode, userLabelHash)
    mapping(bytes32 => UserKey) public userByNode;
    /// orgNode => CSV of partner ENS names
    mapping(bytes32 => string) public orgPartners;

    struct UserKey {
        bytes32 orgNode;
        bytes32 userLabelHash;
    }

    error NotOrgAdmin();
    error NotUser();
    error UserAlreadyExists();
    error UserMissing();
    error UnsupportedSelector();
    error OrgNotRegistered();
    error OrgAlreadyRegistered();
    error LabelMissingPrefix();
    error WrapperNotApproved();

    event OrgRegistered(bytes32 indexed orgNode, address indexed admin, string label);
    event UserRegistered(bytes32 indexed orgNode, string userLabel, address userAddr);
    event UserUpdated(bytes32 indexed orgNode, string userLabel);
    event UserRevoked(bytes32 indexed orgNode, string userLabel);
    event ProofCommitmentSet(bytes32 indexed orgNode, string userLabel, bytes32 commitment);
    event EmailHashSet(bytes32 indexed orgNode, string userLabel, bytes32 emailHash);
    event PartnersSet(bytes32 indexed orgNode, string partnersCsv);

    constructor(INameWrapper _nameWrapper) {
        nameWrapper = _nameWrapper;
    }

    // ─────────────────────────── ORG LIFECYCLE ───────────────────────────

    /// @notice Opt this contract in as the resolver for `<label>.eth`. Requires the
    ///         caller already owns the wrapped name AND has called
    ///         `nameWrapper.setApprovalForAll(address(this), true)`.
    function registerOrg(string calldata label) external returns (bytes32 orgNode) {
        if (!_hasPrefix(label, REQUIRED_PREFIX)) revert LabelMissingPrefix();

        bytes32 lh = keccak256(bytes(label));
        orgNode = _namehash(ETH_NODE, lh);

        if (orgs[orgNode].registered) revert OrgAlreadyRegistered();
        if (nameWrapper.ownerOf(uint256(orgNode)) != msg.sender) revert NotOrgAdmin();
        if (!nameWrapper.isApprovedForAll(msg.sender, address(this))) revert WrapperNotApproved();

        // Hand resolution authority for this org (and all its future subnames) to us.
        nameWrapper.setResolver(orgNode, address(this));

        orgs[orgNode] = OrgData({label: label, registered: true});
        emit OrgRegistered(orgNode, msg.sender, label);
    }

    // ─────────────────────────── USER LIFECYCLE ───────────────────────────

    modifier onlyOrgAdmin(bytes32 orgNode) {
        if (!orgs[orgNode].registered) revert OrgNotRegistered();
        if (nameWrapper.ownerOf(uint256(orgNode)) != msg.sender) revert NotOrgAdmin();
        _;
    }

    function registerUser(
        bytes32 orgNode,
        string calldata userLabel,
        address userAddr,
        bytes32 emailHash,
        string calldata role,
        string calldata namespaces,
        string calldata maxTag,
        uint64 expiry
    ) external onlyOrgAdmin(orgNode) returns (bytes32 userNode) {
        bytes32 lh = keccak256(bytes(userLabel));
        UserData storage u = users[orgNode][lh];
        if (u.exists) revert UserAlreadyExists();

        u.userAddr = userAddr;
        u.emailHash = emailHash;
        u.role = role;
        u.namespaces = namespaces;
        u.maxTag = maxTag;
        u.expiry = expiry;
        u.exists = true;
        userLabels[orgNode][lh] = userLabel;

        userNode = _namehash(orgNode, lh);
        userByNode[userNode] = UserKey({orgNode: orgNode, userLabelHash: lh});

        // Mint the wrapped subname so it appears in ENS app / wallet inventory / OpenSea.
        // Resolver = this contract → text/addr lookups go through our access logic.
        // No fuses; the user can transfer/manage their own name afterwards.
        nameWrapper.setSubnodeRecord(orgNode, userLabel, userAddr, address(this), 0, 0, expiry);

        emit UserRegistered(orgNode, userLabel, userAddr);
        emit EmailHashSet(orgNode, userLabel, emailHash);
    }

    /// @notice Admin can rotate the email-hash binding (e.g. user changed their
    ///         primary work email). userAddr stays write-once - the wallet
    ///         binding does not change with this.
    function setEmailHash(bytes32 orgNode, string calldata userLabel, bytes32 emailHash)
        external
        onlyOrgAdmin(orgNode)
    {
        bytes32 lh = keccak256(bytes(userLabel));
        UserData storage u = users[orgNode][lh];
        if (!u.exists) revert UserMissing();
        u.emailHash = emailHash;
        emit EmailHashSet(orgNode, userLabel, emailHash);
    }

    function updateUser(
        bytes32 orgNode,
        string calldata userLabel,
        string calldata role,
        string calldata namespaces,
        string calldata maxTag,
        uint64 expiry
    ) external onlyOrgAdmin(orgNode) {
        bytes32 lh = keccak256(bytes(userLabel));
        UserData storage u = users[orgNode][lh];
        if (!u.exists) revert UserMissing();
        u.role = role;
        u.namespaces = namespaces;
        u.maxTag = maxTag;
        u.expiry = expiry;
        emit UserUpdated(orgNode, userLabel);
    }

    function revokeUser(bytes32 orgNode, string calldata userLabel)
        external
        onlyOrgAdmin(orgNode)
    {
        bytes32 lh = keccak256(bytes(userLabel));
        UserData storage u = users[orgNode][lh];
        if (!u.exists) revert UserMissing();
        u.revoked = true;
        emit UserRevoked(orgNode, userLabel);
    }

    function setPartners(bytes32 orgNode, string calldata partnersCsv)
        external
        onlyOrgAdmin(orgNode)
    {
        orgPartners[orgNode] = partnersCsv;
        emit PartnersSet(orgNode, partnersCsv);
    }

    function setProofCommitment(bytes32 orgNode, string calldata userLabel, bytes32 commitment)
        external
    {
        bytes32 lh = keccak256(bytes(userLabel));
        UserData storage u = users[orgNode][lh];
        if (!u.exists) revert UserMissing();
        if (u.userAddr != msg.sender) revert NotUser();
        u.proofCommitment = commitment;
        emit ProofCommitmentSet(orgNode, userLabel, commitment);
    }

    // ─────────────────────────── DIRECT READS ───────────────────────────

    function text(bytes32 node, string calldata key)
        external
        view
        override
        returns (string memory)
    {
        UserKey memory uk = userByNode[node];
        if (uk.orgNode != bytes32(0)) {
            return _userText(uk.orgNode, uk.userLabelHash, key);
        }
        if (orgs[node].registered) {
            return _orgText(node, key);
        }
        return "";
    }

    function addr(bytes32 node) external view override returns (address payable) {
        UserKey memory uk = userByNode[node];
        if (uk.orgNode != bytes32(0)) {
            return payable(users[uk.orgNode][uk.userLabelHash].userAddr);
        }
        if (orgs[node].registered) {
            try nameWrapper.ownerOf(uint256(node)) returns (address owner) {
                return payable(owner);
            } catch {
                return payable(address(0));
            }
        }
        return payable(address(0));
    }

    // ─────────────── WILDCARD READS (ENSIP-10) — fallback path ───────────────
    // viem and other ENS-aware libraries dispatch through resolve() unconditionally
    // when the resolver supports IExtendedResolver. We keep the same lookup logic.

    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        override
        returns (bytes memory)
    {
        bytes4 selector = bytes4(data[:4]);

        if (selector == ITextResolver.text.selector) {
            (bytes32 node, string memory key) = abi.decode(data[4:], (bytes32, string));
            return abi.encode(_resolveText(node, name, key));
        }
        if (selector == IAddrResolver.addr.selector) {
            bytes32 node = abi.decode(data[4:], (bytes32));
            return abi.encode(_resolveAddr(node, name));
        }
        revert UnsupportedSelector();
    }

    function _resolveText(bytes32 node, bytes calldata dnsName, string memory key)
        internal
        view
        returns (string memory)
    {
        UserKey memory uk = userByNode[node];
        if (uk.orgNode != bytes32(0)) return _userText(uk.orgNode, uk.userLabelHash, key);
        if (orgs[node].registered) return _orgText(node, key);
        // Fallback: try to resolve from DNS-encoded name (e.g., user-level subname not
        // yet indexed by node — shouldn't happen post-mint but defensive).
        (bytes32 derivedOrg, bytes32 userLh, bool isUserLevel) = _parseName(dnsName);
        if (isUserLevel && users[derivedOrg][userLh].exists) {
            return _userText(derivedOrg, userLh, key);
        }
        if (orgs[derivedOrg].registered) return _orgText(derivedOrg, key);
        return "";
    }

    function _resolveAddr(bytes32 node, bytes calldata dnsName) internal view returns (address) {
        UserKey memory uk = userByNode[node];
        if (uk.orgNode != bytes32(0)) return users[uk.orgNode][uk.userLabelHash].userAddr;
        if (orgs[node].registered) {
            try nameWrapper.ownerOf(uint256(node)) returns (address owner) {
                return owner;
            } catch {
                return address(0);
            }
        }
        (bytes32 derivedOrg, bytes32 userLh, bool isUserLevel) = _parseName(dnsName);
        if (isUserLevel) return users[derivedOrg][userLh].userAddr;
        if (orgs[derivedOrg].registered) {
            try nameWrapper.ownerOf(uint256(derivedOrg)) returns (address owner) {
                return owner;
            } catch {
                return address(0);
            }
        }
        return address(0);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IExtendedResolver).interfaceId
            || interfaceId == type(ITextResolver).interfaceId
            || interfaceId == type(IAddrResolver).interfaceId;
    }

    // ─────────────────────────── INTERNAL ───────────────────────────

    /// @dev Parses a DNS-encoded name. Recognized shapes:
    ///   "<orgLabel>.eth"                    → (orgNode, 0, false)
    ///   "<userLabel>.<orgLabel>.eth"        → (orgNode, userLabelHash, true)
    ///   anything else: returns (0, 0, false) — caller handles "unknown".
    function _parseName(bytes calldata name)
        internal
        pure
        returns (bytes32 orgNode, bytes32 userLabelHash, bool isUserLevel)
    {
        (bytes32 lh0, uint256 o1) = _readLabel(name, 0);
        if (lh0 == bytes32(0)) return (bytes32(0), bytes32(0), false);

        (bytes32 lh1, uint256 o2) = _readLabel(name, o1);
        if (lh1 == bytes32(0)) return (bytes32(0), bytes32(0), false);

        (bytes32 lh2, uint256 o3) = _readLabel(name, o2);

        if (lh2 == bytes32(0)) {
            // Two labels: <a>.<b>. Treat as <orgLabel>.<eth>.
            // Verify lh1 is the .eth labelhash: namehash should equal ETH_NODE-derived.
            if (_namehash(bytes32(0), lh1) != ETH_NODE) return (bytes32(0), bytes32(0), false);
            orgNode = _namehash(ETH_NODE, lh0);
            return (orgNode, bytes32(0), false);
        }

        (bytes32 lh3, ) = _readLabel(name, o3);
        if (lh3 == bytes32(0)) {
            // Three labels: <user>.<org>.<eth>
            if (_namehash(bytes32(0), lh2) != ETH_NODE) return (bytes32(0), bytes32(0), false);
            orgNode = _namehash(ETH_NODE, lh1);
            userLabelHash = lh0;
            isUserLevel = true;
            return (orgNode, userLabelHash, isUserLevel);
        }

        return (bytes32(0), bytes32(0), false);
    }

    function _readLabel(bytes calldata name, uint256 offset)
        internal
        pure
        returns (bytes32 labelHash, uint256 nextOffset)
    {
        if (offset >= name.length) return (bytes32(0), offset);
        uint8 size = uint8(name[offset]);
        nextOffset = offset + 1 + size;
        if (size == 0) return (bytes32(0), nextOffset);
        labelHash = keccak256(name[offset + 1:nextOffset]);
    }

    function _namehash(bytes32 parent, bytes32 lh) internal pure returns (bytes32 r) {
        assembly {
            mstore(0, parent)
            mstore(32, lh)
            r := keccak256(0, 64)
        }
    }

    function _hasPrefix(string calldata s, string memory prefix) internal pure returns (bool) {
        bytes memory bs = bytes(s);
        bytes memory bp = bytes(prefix);
        if (bs.length < bp.length) return false;
        for (uint256 i = 0; i < bp.length; i++) {
            if (bs[i] != bp[i]) return false;
        }
        return true;
    }

    function _orgText(bytes32 orgNode, string memory key)
        internal
        view
        returns (string memory)
    {
        bytes32 k = keccak256(bytes(key));
        if (k == keccak256("zkma:partners")) return orgPartners[orgNode];
        if (k == keccak256("zkma:platform")) return "zkmemoryauthorization";
        if (k == keccak256("zkma:org")) return orgs[orgNode].label;
        return "";
    }

    function _userText(bytes32 orgNode, bytes32 userLh, string memory key)
        internal
        view
        returns (string memory)
    {
        UserData storage u = users[orgNode][userLh];
        if (!u.exists) return "";

        bytes32 k = keccak256(bytes(key));
        if (k == keccak256("zkma:role"))             return u.role;
        if (k == keccak256("zkma:namespaces"))       return u.namespaces;
        if (k == keccak256("zkma:max-tag"))          return u.maxTag;
        if (k == keccak256("zkma:expiry"))           return _u64ToString(u.expiry);
        if (k == keccak256("zkma:revoked"))          return u.revoked ? "true" : "false";
        if (k == keccak256("zkma:proof-commitment")) return _bytes32ToHex(u.proofCommitment);
        if (k == keccak256("zkma:email-hash"))       return _bytes32ToHex(u.emailHash);
        if (k == keccak256("zkma:org"))              return orgs[orgNode].label;
        return "";
    }

    function _u64ToString(uint64 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint64 t = v;
        uint256 digits;
        while (t != 0) { digits++; t /= 10; }
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + uint256(v % 10)));
            v /= 10;
        }
        return string(buf);
    }

    function _bytes32ToHex(bytes32 v) internal pure returns (string memory) {
        bytes memory out = new bytes(66);
        out[0] = "0";
        out[1] = "x";
        bytes16 alphabet = 0x30313233343536373839616263646566; // "0123456789abcdef"
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(v[i]);
            out[2 + i * 2]     = alphabet[b >> 4];
            out[2 + i * 2 + 1] = alphabet[b & 0x0f];
        }
        return string(out);
    }
}
