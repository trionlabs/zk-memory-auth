// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "forge-std/Test.sol";

import {ENSRegistry} from "../src/contracts/registry/ENSRegistry.sol";
import {BaseRegistrarImplementation} from "../src/contracts/ethregistrar/BaseRegistrarImplementation.sol";
import {ReverseRegistrar} from "../src/contracts/reverseRegistrar/ReverseRegistrar.sol";
import {NameWrapper} from "../src/contracts/wrapper/NameWrapper.sol";
import {INameWrapper, CANNOT_UNWRAP} from "../src/contracts/wrapper/INameWrapper.sol";
import {IMetadataService} from "../src/contracts/wrapper/IMetadataService.sol";
import {StaticMetadataService} from "../src/contracts/wrapper/StaticMetadataService.sol";

import {IExtendedResolver} from "../src/contracts/resolvers/profiles/IExtendedResolver.sol";
import {ITextResolver} from "../src/contracts/resolvers/profiles/ITextResolver.sol";
import {IAddrResolver} from "../src/contracts/resolvers/profiles/IAddrResolver.sol";

import {ZkmaResolver} from "../src/zkma/ZkmaResolver.sol";

contract ZkmaResolverTest is Test {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external pure returns (bytes4) { return this.onERC1155Received.selector; }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external pure returns (bytes4) { return this.onERC1155BatchReceived.selector; }
    function supportsInterface(bytes4) external pure returns (bool) { return true; }

    bytes32 constant ROOT_NODE = bytes32(0);
    bytes32 constant ETH_NODE = 0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

    ENSRegistry ens;
    BaseRegistrarImplementation baseRegistrar;
    NameWrapper nameWrapper;
    ZkmaResolver resolver;

    address platform = address(this);
    address adminA   = address(0xAAAA); // hospital admin
    address adminB   = address(0xBBBB); // insurance admin
    address aysel    = address(0xA15E1);
    address bob      = address(0xB0B);

    string  hospitalLabel  = "zkmemory-istanbulhospital";
    string  insuranceLabel = "zkmemory-acmeinsurance";
    bytes32 hospitalNode;
    bytes32 insuranceNode;

    // Stand-in email hash; tests do not need a real email value.
    bytes32 constant AYSEL_EMAIL_HASH = keccak256("aysel@istanbulhospital.org");
    bytes32 constant BOB_EMAIL_HASH   = keccak256("bob@istanbulhospital.org");

    function setUp() public {
        vm.warp(365 days);

        ens = new ENSRegistry();
        ens.setSubnodeOwner(ROOT_NODE, keccak256("reverse"), platform);
        bytes32 reverseNode = keccak256(abi.encodePacked(ROOT_NODE, keccak256("reverse")));
        ReverseRegistrar reverseRegistrar = new ReverseRegistrar(ens);
        ens.setSubnodeOwner(reverseNode, keccak256("addr"), address(reverseRegistrar));

        ens.setSubnodeOwner(ROOT_NODE, keccak256("eth"), platform);
        baseRegistrar = new BaseRegistrarImplementation(ens, ETH_NODE);
        ens.setSubnodeOwner(ROOT_NODE, keccak256("eth"), address(baseRegistrar));

        StaticMetadataService meta = new StaticMetadataService("https://ens.domains");
        nameWrapper = new NameWrapper(ens, baseRegistrar, IMetadataService(address(meta)));
        baseRegistrar.addController(address(nameWrapper));
        baseRegistrar.addController(platform);

        resolver = new ZkmaResolver(INameWrapper(address(nameWrapper)));

        // Each org admin separately registers + wraps their own .eth name.
        hospitalNode  = _registerWrapped(hospitalLabel,  adminA);
        insuranceNode = _registerWrapped(insuranceLabel, adminB);
    }

    /// Mints `<label>.eth` to `owner` via BaseRegistrar, then wraps it via NameWrapper.
    function _registerWrapped(string memory label, address owner) internal returns (bytes32 node) {
        bytes32 lh = keccak256(bytes(label));
        baseRegistrar.register(uint256(lh), owner, 365 days);
        vm.prank(owner);
        baseRegistrar.setApprovalForAll(address(nameWrapper), true);
        vm.prank(owner);
        nameWrapper.wrapETH2LD(label, owner, uint16(CANNOT_UNWRAP), address(0));
        node = keccak256(abi.encodePacked(ETH_NODE, lh));
    }

    // ─────────────────────────── invariants ───────────────────────────

    function test_supportsInterfaces() public {
        assertTrue(resolver.supportsInterface(type(IExtendedResolver).interfaceId));
        assertTrue(resolver.supportsInterface(type(ITextResolver).interfaceId));
        assertTrue(resolver.supportsInterface(type(IAddrResolver).interfaceId));
        assertTrue(resolver.supportsInterface(0x01ffc9a7));
        assertFalse(resolver.supportsInterface(0xdeadbeef));
    }

    // ─────────────────────────── registerOrg ───────────────────────────

    function test_registerOrg_happy() public {
        // Admin must approve resolver as operator first.
        vm.prank(adminA);
        nameWrapper.setApprovalForAll(address(resolver), true);

        vm.prank(adminA);
        bytes32 node = resolver.registerOrg(hospitalLabel);
        assertEq(node, hospitalNode);

        (string memory label, bool registered) = resolver.orgs(hospitalNode);
        assertEq(label, hospitalLabel);
        assertTrue(registered);

        // Resolver should now be set on the org's ENS record.
        assertEq(ens.resolver(hospitalNode), address(resolver));
    }

    function test_registerOrg_revertsIfPrefixMissing() public {
        // Pre-register a name without the prefix.
        bytes32 badNode = _registerWrapped("istanbulhospital", adminA);
        badNode; // silence unused

        vm.prank(adminA);
        nameWrapper.setApprovalForAll(address(resolver), true);

        vm.prank(adminA);
        vm.expectRevert(ZkmaResolver.LabelMissingPrefix.selector);
        resolver.registerOrg("istanbulhospital");
    }

    function test_registerOrg_revertsIfNotOwner() public {
        vm.prank(bob);
        nameWrapper.setApprovalForAll(address(resolver), true);

        vm.prank(bob);
        vm.expectRevert(ZkmaResolver.NotOrgAdmin.selector);
        resolver.registerOrg(hospitalLabel);
    }

    function test_registerOrg_revertsIfNotApproved() public {
        // Don't approve.
        vm.prank(adminA);
        vm.expectRevert(ZkmaResolver.WrapperNotApproved.selector);
        resolver.registerOrg(hospitalLabel);
    }

    function test_registerOrg_revertsIfAlreadyRegistered() public {
        vm.prank(adminA);
        nameWrapper.setApprovalForAll(address(resolver), true);
        vm.prank(adminA);
        resolver.registerOrg(hospitalLabel);

        vm.prank(adminA);
        vm.expectRevert(ZkmaResolver.OrgAlreadyRegistered.selector);
        resolver.registerOrg(hospitalLabel);
    }

    // ─────────────────────────── registerUser ───────────────────────────

    function _registerHospital() internal {
        vm.prank(adminA);
        nameWrapper.setApprovalForAll(address(resolver), true);
        vm.prank(adminA);
        resolver.registerOrg(hospitalLabel);
    }

    function test_registerUser_mintsWrappedSubname() public {
        _registerHospital();

        vm.prank(adminA);
        bytes32 userNode = resolver.registerUser(
            hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH,
            "nurse", "clinical,operational", "confidential", uint64(block.timestamp + 7 days)
        );

        // User now owns the wrapped subname.
        assertEq(nameWrapper.ownerOf(uint256(userNode)), aysel);

        // Resolver records text data.
        assertEq(resolver.text(userNode, "zkma:role"), "nurse");
        assertEq(resolver.text(userNode, "zkma:namespaces"), "clinical,operational");
        assertEq(resolver.text(userNode, "zkma:max-tag"), "confidential");
        assertEq(resolver.text(userNode, "zkma:email-hash"), _hex(AYSEL_EMAIL_HASH));

        // addr returns the user's wallet (signature verification path).
        assertEq(resolver.addr(userNode), payable(aysel));
    }

    function test_setEmailHash_adminCanRotate() public {
        _registerHospital();
        vm.prank(adminA);
        resolver.registerUser(
            hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH,
            "nurse", "clinical", "confidential", uint64(block.timestamp + 7 days)
        );

        bytes32 newHash = keccak256("aysel.new@istanbulhospital.org");
        vm.prank(adminA);
        resolver.setEmailHash(hospitalNode, "aysel", newHash);

        bytes32 userNode = keccak256(abi.encodePacked(hospitalNode, keccak256("aysel")));
        assertEq(resolver.text(userNode, "zkma:email-hash"), _hex(newHash));
    }

    function test_setEmailHash_revertsIfNotAdmin() public {
        _registerHospital();
        vm.prank(adminA);
        resolver.registerUser(
            hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH,
            "nurse", "clinical", "confidential", uint64(block.timestamp + 7 days)
        );

        vm.prank(bob);
        vm.expectRevert(ZkmaResolver.NotOrgAdmin.selector);
        resolver.setEmailHash(hospitalNode, "aysel", BOB_EMAIL_HASH);
    }

    function test_registerUser_revertsIfNotAdmin() public {
        _registerHospital();
        vm.prank(bob);
        vm.expectRevert(ZkmaResolver.NotOrgAdmin.selector);
        resolver.registerUser(hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH, "nurse", "clinical", "confidential", 0);
    }

    function test_registerUser_revertsIfDuplicate() public {
        _registerHospital();
        vm.prank(adminA);
        resolver.registerUser(hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH, "nurse", "clinical", "confidential", uint64(block.timestamp + 1 days));
        vm.prank(adminA);
        vm.expectRevert(ZkmaResolver.UserAlreadyExists.selector);
        resolver.registerUser(hospitalNode, "aysel", bob, BOB_EMAIL_HASH, "nurse", "clinical", "confidential", uint64(block.timestamp + 1 days));
    }

    function test_registerUser_revertsIfOrgNotRegistered() public {
        // hospital is NOT registered yet.
        vm.prank(adminA);
        vm.expectRevert(ZkmaResolver.OrgNotRegistered.selector);
        resolver.registerUser(hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH, "nurse", "clinical", "confidential", uint64(block.timestamp + 1 days));
    }

    // ─────────────────────────── trust kernel ───────────────────────────

    function test_admin_cannotSetProofCommitment() public {
        _registerHospital();
        vm.prank(adminA);
        resolver.registerUser(hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH, "nurse", "clinical", "confidential", uint64(block.timestamp + 1 days));

        vm.prank(adminA);
        vm.expectRevert(ZkmaResolver.NotUser.selector);
        resolver.setProofCommitment(hospitalNode, "aysel", bytes32(uint256(0xdeadbeef)));
    }

    function test_user_canSetOwnProofCommitment() public {
        _registerHospital();
        vm.prank(adminA);
        resolver.registerUser(hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH, "nurse", "clinical", "confidential", uint64(block.timestamp + 1 days));

        bytes32 c = bytes32(uint256(0xc0ffee));
        vm.prank(aysel);
        resolver.setProofCommitment(hospitalNode, "aysel", c);

        bytes32 userNode = keccak256(abi.encodePacked(hospitalNode, keccak256("aysel")));
        assertEq(resolver.text(userNode, "zkma:proof-commitment"), _hex(c));
    }

    function test_userAddr_isImmutableAfterRegistration() public {
        _registerHospital();
        vm.prank(adminA);
        resolver.registerUser(hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH, "nurse", "clinical", "confidential", uint64(block.timestamp + 1 days));

        vm.prank(adminA);
        vm.expectRevert(ZkmaResolver.UserAlreadyExists.selector);
        resolver.registerUser(hospitalNode, "aysel", bob, BOB_EMAIL_HASH, "nurse", "clinical", "confidential", uint64(block.timestamp + 1 days));

        bytes32 userNode = keccak256(abi.encodePacked(hospitalNode, keccak256("aysel")));
        assertEq(resolver.addr(userNode), payable(aysel), "userAddr survived re-registration attempt");
    }

    // ─────────────────────────── direct text/addr ───────────────────────────

    function test_orgText_partners_andOrgLabel() public {
        _registerHospital();
        vm.prank(adminA);
        resolver.setPartners(hospitalNode, "zkmemory-acmeinsurance.eth");

        assertEq(resolver.text(hospitalNode, "zkma:partners"), "zkmemory-acmeinsurance.eth");
        assertEq(resolver.text(hospitalNode, "zkma:platform"), "zkmemoryauthorization");
        assertEq(resolver.text(hospitalNode, "zkma:org"), hospitalLabel);
    }

    function test_orgAddr_returnsAdmin() public {
        _registerHospital();
        assertEq(resolver.addr(hospitalNode), payable(adminA));
    }

    // ─────────────────────────── ENS registry wiring ───────────────────────────

    function test_ensRegistry_resolverPointedAtUs() public {
        _registerHospital();
        // After registerOrg, the org's resolver in the ENS registry is us — required
        // for ENS walk-up to dispatch to our wildcard / direct read paths.
        assertEq(ens.resolver(hospitalNode), address(resolver));
    }

    // ─────────────────────────── wildcard fallback ───────────────────────────

    function test_resolve_userText_role_viaWildcard() public {
        _registerHospital();
        vm.prank(adminA);
        resolver.registerUser(hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH, "nurse", "clinical,operational", "confidential", uint64(block.timestamp + 7 days));

        bytes memory dnsName = _dns3("aysel", hospitalLabel, "eth");
        bytes32 userNode = keccak256(abi.encodePacked(hospitalNode, keccak256("aysel")));
        bytes memory call = abi.encodeWithSelector(ITextResolver.text.selector, userNode, "zkma:role");
        string memory v = abi.decode(resolver.resolve(dnsName, call), (string));
        assertEq(v, "nurse");
    }

    function test_resolve_userAddr_viaWildcard() public {
        _registerHospital();
        vm.prank(adminA);
        resolver.registerUser(hospitalNode, "aysel", aysel, AYSEL_EMAIL_HASH, "nurse", "clinical", "confidential", uint64(block.timestamp + 1 days));

        bytes memory dnsName = _dns3("aysel", hospitalLabel, "eth");
        bytes32 userNode = keccak256(abi.encodePacked(hospitalNode, keccak256("aysel")));
        bytes memory call = abi.encodeWithSelector(IAddrResolver.addr.selector, userNode);
        address a = abi.decode(resolver.resolve(dnsName, call), (address));
        assertEq(a, aysel);
    }

    function test_resolve_orgText_partners_viaWildcard() public {
        _registerHospital();
        vm.prank(adminA);
        resolver.setPartners(hospitalNode, "zkmemory-acmeinsurance.eth");

        bytes memory dnsName = _dns2(hospitalLabel, "eth");
        bytes memory call = abi.encodeWithSelector(ITextResolver.text.selector, hospitalNode, "zkma:partners");
        string memory v = abi.decode(resolver.resolve(dnsName, call), (string));
        assertEq(v, "zkmemory-acmeinsurance.eth");
    }

    function test_resolve_revertsForUnsupportedSelector() public {
        bytes memory dnsName = _dns2(hospitalLabel, "eth");
        bytes memory call = abi.encodeWithSelector(bytes4(0xdeadbeef), bytes32(0));
        vm.expectRevert(ZkmaResolver.UnsupportedSelector.selector);
        resolver.resolve(dnsName, call);
    }

    // ─────────────────────────── helpers ───────────────────────────

    function _hex(bytes32 v) internal pure returns (string memory) {
        bytes memory out = new bytes(66);
        out[0] = "0";
        out[1] = "x";
        bytes16 alphabet = 0x30313233343536373839616263646566;
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(v[i]);
            out[2 + i*2]     = alphabet[b >> 4];
            out[2 + i*2 + 1] = alphabet[b & 0x0f];
        }
        return string(out);
    }

    function _dns2(string memory a, string memory b) internal pure returns (bytes memory) {
        bytes memory ba = bytes(a); bytes memory bb = bytes(b);
        bytes memory out = new bytes(1 + ba.length + 1 + bb.length + 1);
        uint256 i = 0;
        out[i++] = bytes1(uint8(ba.length)); for (uint256 j = 0; j < ba.length; j++) out[i++] = ba[j];
        out[i++] = bytes1(uint8(bb.length)); for (uint256 j = 0; j < bb.length; j++) out[i++] = bb[j];
        out[i++] = 0x00;
        return out;
    }

    function _dns3(string memory a, string memory b, string memory c) internal pure returns (bytes memory) {
        bytes memory ba = bytes(a); bytes memory bb = bytes(b); bytes memory bc = bytes(c);
        bytes memory out = new bytes(1 + ba.length + 1 + bb.length + 1 + bc.length + 1);
        uint256 i = 0;
        out[i++] = bytes1(uint8(ba.length)); for (uint256 j = 0; j < ba.length; j++) out[i++] = ba[j];
        out[i++] = bytes1(uint8(bb.length)); for (uint256 j = 0; j < bb.length; j++) out[i++] = bb[j];
        out[i++] = bytes1(uint8(bc.length)); for (uint256 j = 0; j < bc.length; j++) out[i++] = bc[j];
        out[i++] = 0x00;
        return out;
    }
}
