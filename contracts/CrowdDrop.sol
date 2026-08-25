// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Multi-drop ERC-20 escrow. Token is fixed at deploy (USDT on Polygon, TestUSD on Sepolia).
contract CrowdDrop is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_GOAL = 2;
    uint256 public constant MAX_GOAL = 1000;
    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 90 days;

    enum Status {
        Active,
        Successful,
        Expired,
        Claimed
    }

    struct Drop {
        address seller;
        uint256 contribution;
        uint256 goal;
        uint256 deadline;
        uint256 buyerCount;
        uint256 escrowed;
        bool claimed;
    }

    IERC20 public immutable token;
    uint256 public nextDropId = 1;

    mapping(uint256 dropId => Drop) private drops;
    mapping(uint256 dropId => mapping(address buyer => uint256 amount)) private deposits;

    event DropCreated(
        uint256 indexed dropId,
        address indexed seller,
        uint256 contribution,
        uint256 goal,
        uint256 deadline
    );
    event Joined(uint256 indexed dropId, address indexed buyer, uint256 amount);
    event Withdrawn(uint256 indexed dropId, address indexed buyer, uint256 amount);
    event Claimed(uint256 indexed dropId, address indexed seller, uint256 amount);

    constructor(address token_) {
        require(token_ != address(0), "token required");
        token = IERC20(token_);
    }

    function createDrop(uint256 contribution, uint256 goal, uint256 duration) external returns (uint256 dropId) {
        require(contribution > 0, "contribution required");
        require(goal >= MIN_GOAL, "goal too small");
        require(goal <= MAX_GOAL, "goal too large");
        require(duration >= MIN_DURATION, "duration too short");
        require(duration <= MAX_DURATION, "duration too long");

        dropId = nextDropId;
        nextDropId += 1;

        uint256 deadline = block.timestamp + duration;
        drops[dropId] = Drop({
            seller: msg.sender,
            contribution: contribution,
            goal: goal,
            deadline: deadline,
            buyerCount: 0,
            escrowed: 0,
            claimed: false
        });

        emit DropCreated(dropId, msg.sender, contribution, goal, deadline);
    }

    function join(uint256 dropId) external nonReentrant {
        Drop storage drop = _existingDrop(dropId);
        require(msg.sender != drop.seller, "seller cannot join");
        require(block.timestamp < drop.deadline, "expired");
        require(drop.buyerCount < drop.goal, "already successful");
        require(deposits[dropId][msg.sender] == 0, "already joined");

        uint256 amount = drop.contribution;
        deposits[dropId][msg.sender] = amount;
        drop.buyerCount += 1;
        drop.escrowed += amount;

        emit Joined(dropId, msg.sender, amount);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 dropId) external nonReentrant {
        Drop storage drop = _existingDrop(dropId);
        uint256 amount = deposits[dropId][msg.sender];
        require(amount > 0, "no deposit");
        require(drop.buyerCount < drop.goal, "drop successful");

        deposits[dropId][msg.sender] = 0;
        drop.buyerCount -= 1;
        drop.escrowed -= amount;

        emit Withdrawn(dropId, msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
    }

    function claim(uint256 dropId) external nonReentrant {
        Drop storage drop = _existingDrop(dropId);
        require(msg.sender == drop.seller, "not seller");
        require(drop.buyerCount >= drop.goal, "not successful");
        require(!drop.claimed, "already claimed");

        uint256 amount = drop.escrowed;
        require(amount > 0, "nothing to claim");

        drop.claimed = true;
        drop.escrowed = 0;

        emit Claimed(dropId, msg.sender, amount);
        token.safeTransfer(drop.seller, amount);
    }

    function getDrop(uint256 dropId) external view returns (Drop memory) {
        return _existingDrop(dropId);
    }

    function depositOf(uint256 dropId, address buyer) external view returns (uint256) {
        _existingDrop(dropId);
        return deposits[dropId][buyer];
    }

    function isSuccessful(uint256 dropId) public view returns (bool) {
        Drop storage drop = _existingDrop(dropId);
        return drop.buyerCount >= drop.goal;
    }

    function statusOf(uint256 dropId) external view returns (Status) {
        Drop storage drop = _existingDrop(dropId);
        if (drop.claimed)
            return Status.Claimed;
        if (drop.buyerCount >= drop.goal)
            return Status.Successful;
        if (block.timestamp >= drop.deadline)
            return Status.Expired;
        return Status.Active;
    }

    function _existingDrop(uint256 dropId) private view returns (Drop storage drop) {
        drop = drops[dropId];
        require(drop.seller != address(0), "unknown drop");
    }
}
