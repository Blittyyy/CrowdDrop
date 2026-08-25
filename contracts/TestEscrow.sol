// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Disposable Sepolia feasibility contract. Not production.
contract TestEscrow {
    uint256 public constant GOAL = 2;

    address public immutable seller;
    uint256 public immutable contribution;
    uint256 public immutable deadline;

    mapping(address => uint256) public deposits;
    uint256 public buyerCount;
    bool public sellerClaimed;

    constructor(address seller_, uint256 contribution_, uint256 durationSeconds) {
        require(seller_ != address(0), "seller required");
        require(contribution_ > 0, "contribution required");
        require(durationSeconds > 0, "duration required");
        seller = seller_;
        contribution = contribution_;
        deadline = block.timestamp + durationSeconds;
    }

    function isSuccessful() public view returns (bool) {
        return buyerCount == GOAL;
    }

    function isExpired() public view returns (bool) {
        return block.timestamp >= deadline && buyerCount < GOAL;
    }

    function committedAmount() public view returns (uint256) {
        return address(this).balance;
    }

    function join() external payable {
        require(msg.sender != seller, "seller cannot join");
        require(block.timestamp < deadline, "expired");
        require(buyerCount < GOAL, "already successful");
        require(deposits[msg.sender] == 0, "already joined");
        require(msg.value == contribution, "wrong amount");

        deposits[msg.sender] = msg.value;
        buyerCount += 1;
    }

    function withdraw() external {
        uint256 amount = deposits[msg.sender];
        require(amount > 0, "no deposit");
        require(!isSuccessful(), "drop successful");

        deposits[msg.sender] = 0;
        buyerCount -= 1;

        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    function claim() external {
        require(msg.sender == seller, "not seller");
        require(isSuccessful(), "not successful");
        require(!sellerClaimed, "already claimed");

        sellerClaimed = true;
        uint256 amount = address(this).balance;
        require(amount > 0, "nothing to claim");

        (bool ok,) = seller.call{value: amount}("");
        require(ok, "claim failed");
    }
}
