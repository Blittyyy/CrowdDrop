// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Disposable Sepolia ERC-20 escrow. Not production. Does not take native ETH.
contract TestTokenEscrow {
    using SafeERC20 for IERC20;

    uint256 public constant GOAL = 2;

    IERC20 public immutable token;
    address public immutable seller;
    uint256 public immutable contribution;
    uint256 public immutable deadline;

    mapping(address => uint256) public deposits;
    uint256 public buyerCount;
    bool public sellerClaimed;

    constructor(address seller_, address token_, uint256 contribution_, uint256 durationSeconds) {
        require(seller_ != address(0), "seller required");
        require(token_ != address(0), "token required");
        require(contribution_ > 0, "contribution required");
        require(durationSeconds > 0, "duration required");
        seller = seller_;
        token = IERC20(token_);
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
        return token.balanceOf(address(this));
    }

    function join() external {
        require(msg.sender != seller, "seller cannot join");
        require(block.timestamp < deadline, "expired");
        require(buyerCount < GOAL, "already successful");
        require(deposits[msg.sender] == 0, "already joined");

        token.safeTransferFrom(msg.sender, address(this), contribution);
        deposits[msg.sender] = contribution;
        buyerCount += 1;
    }

    function withdraw() external {
        uint256 amount = deposits[msg.sender];
        require(amount > 0, "no deposit");
        require(!isSuccessful(), "drop successful");

        deposits[msg.sender] = 0;
        buyerCount -= 1;
        token.safeTransfer(msg.sender, amount);
    }

    function claim() external {
        require(msg.sender == seller, "not seller");
        require(isSuccessful(), "not successful");
        require(!sellerClaimed, "already claimed");

        sellerClaimed = true;
        uint256 amount = token.balanceOf(address(this));
        require(amount > 0, "nothing to claim");
        token.safeTransfer(seller, amount);
    }
}
