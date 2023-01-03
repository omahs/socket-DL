// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.7;

import "../interfaces/native-bridge/IInbox.sol";
import "../interfaces/native-bridge/INativeInitiator.sol";
import "../interfaces/native-bridge/INativeSwitchboard.sol";
import "../interfaces/ISocket.sol";
import "../utils/Ownable.sol";

contract ArbitrumL1NativeInitiator is INativeInitiator, Ownable(msg.sender) {
    address public remoteNativeSwitchboard;
    address public remoteRefundAddress;
    address public callValueRefundAddress;

    IInbox public inbox;
    ISocket public socket;

    event UpdatedInboxAddress(address inbox_);
    event UpdatedRefundAddresses(
        address remoteRefundAddress_,
        address callValueRefundAddress_
    );
    event UpdatedRemoteNativeSwitchboard(address remoteNativeSwitchboard_);
    event UpdatedSocket(address socket);

    error NoRootFound();

    constructor(
        IInbox inbox_,
        ISocket socket_,
        address remoteNativeSwitchboard_
    ) {
        inbox = inbox_;
        socket = socket_;

        remoteRefundAddress = msg.sender;
        callValueRefundAddress = msg.sender;
        remoteNativeSwitchboard = remoteNativeSwitchboard_;
    }

    function initateNativeConfirmation(
        uint256 packetId
    ) external payable override {
        // todo: need to handle these fee settings dynamically
        uint256[3] memory bridgeParams = [uint256(1), uint256(2), uint256(3)];

        bytes32 root = socket.remoteRoots(packetId);
        if (root == bytes32(0)) revert NoRootFound();

        bytes memory data = abi.encodeWithSelector(
            INativeSwitchboard.receivePacket.selector,
            packetId,
            root
        );

        // to avoid stack too deep
        address callValueRefund = callValueRefundAddress;
        address remoteRefund = remoteRefundAddress;

        inbox.createRetryableTicket{value: msg.value}(
            remoteNativeSwitchboard,
            0, // no value needed for receivePacket
            bridgeParams[0], // maxSubmissionCost
            remoteRefund,
            callValueRefund,
            bridgeParams[1], // maxGas
            bridgeParams[2], // gasPriceBid
            data
        );
    }

    function updateRefundAddresses(
        address remoteRefundAddress_,
        address callValueRefundAddress_
    ) external onlyOwner {
        remoteRefundAddress = remoteRefundAddress_;
        callValueRefundAddress = callValueRefundAddress_;

        emit UpdatedRefundAddresses(
            remoteRefundAddress_,
            callValueRefundAddress_
        );
    }

    function updateInboxAddresses(address inbox_) external onlyOwner {
        inbox = IInbox(inbox_);
        emit UpdatedInboxAddress(inbox_);
    }

    function updateRemoteNativeSwitchboard(
        address remoteNativeSwitchboard_
    ) external onlyOwner {
        remoteNativeSwitchboard = remoteNativeSwitchboard_;
        emit UpdatedRemoteNativeSwitchboard(remoteNativeSwitchboard_);
    }

    function updateSocket(address socket_) external onlyOwner {
        socket = ISocket(socket_);
        emit UpdatedSocket(socket_);
    }
}
