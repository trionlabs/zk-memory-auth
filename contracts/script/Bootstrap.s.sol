// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "forge-std/Script.sol";

import {INameWrapper} from "../src/contracts/wrapper/INameWrapper.sol";
import {ZkmaResolver} from "../src/zkma/ZkmaResolver.sol";

/// @notice One-shot deploy of the ZkmaResolver to Sepolia. The contract is now standalone:
///         no parent name to wrap, no org subnames to mint at deploy time. Each org
///         registers itself by calling `registerOrg(label)` after registering their own
///         `zkmemory-<orgname>.eth` on the Sepolia ENS app.
///
/// Required env:
///   PLATFORM_KEY          private key of any wallet with Sepolia ETH (just pays the deploy)
///
/// Usage:
///   forge script script/Bootstrap.s.sol:Bootstrap \
///       --rpc-url $SEPOLIA_RPC_URL --broadcast
contract Bootstrap is Script {
    address constant ENS_REGISTRY = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    address constant NAME_WRAPPER = 0x0635513f179D50A207757E05759CbD106d7dFcE8;

    function run() external {
        uint256 platformKey = vm.envUint("PLATFORM_KEY");
        address platform = vm.addr(platformKey);

        vm.startBroadcast(platformKey);
        ZkmaResolver resolver = new ZkmaResolver(INameWrapper(NAME_WRAPPER));
        vm.stopBroadcast();

        console.log("ZkmaResolver:", address(resolver));

        string memory j = string.concat(
            '{\n',
            '  "chainId": 11155111,\n',
            '  "ensRegistry": "', vm.toString(ENS_REGISTRY), '",\n',
            '  "nameWrapper": "', vm.toString(NAME_WRAPPER), '",\n',
            '  "zkmaResolver": "', vm.toString(address(resolver)), '",\n',
            '  "deployBlock": ', vm.toString(block.number), ',\n',
            '  "platformAddr": "', vm.toString(platform), '",\n',
            '  "requiredPrefix": "zkmemory-",\n',
            '  "orgs": {}\n',
            '}\n'
        );
        vm.writeFile("./deployments/sepolia.json", j);

        console.log("Artifact: ./deployments/sepolia.json");
    }
}
