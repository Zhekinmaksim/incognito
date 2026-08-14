import '@nomicfoundation/hardhat-toolbox';
import 'dotenv/config';

/**
 * Inco Lightning runs on Base. Sepolia for building, mainnet for the night of
 * the deadline: the contract is identical, only the Lib import differs.
 */
export default {
  solidity: {
    version: '0.8.30',
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: 'cancun' },
  },
  networks: {
    baseSepolia: {
      url: process.env.RPC_URL || 'https://sepolia.base.org',
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
      chainId: 84532,
    },
    base: {
      url: process.env.RPC_MAINNET || 'https://mainnet.base.org',
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
      chainId: 8453,
    },
  },
};
