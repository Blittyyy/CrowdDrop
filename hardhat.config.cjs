require('@nomicfoundation/hardhat-ethers')
require('dotenv/config')

const sepoliaAccounts = process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : []
const polygonAccounts = process.env.POLYGON_PRIVATE_KEY ? [process.env.POLYGON_PRIVATE_KEY] : []

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: '0.8.24',
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
      chainId: 11155111,
      accounts: sepoliaAccounts,
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
      chainId: 137,
      accounts: polygonAccounts,
    },
  },
}
