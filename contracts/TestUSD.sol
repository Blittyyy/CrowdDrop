// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Disposable Sepolia stand-in for USDT-style 6-decimal amounts. Not production.
contract TestUSD is ERC20, Ownable {
    constructor() ERC20("Test USD", "TUSD") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "to required");
        _mint(to, amount);
    }
}
