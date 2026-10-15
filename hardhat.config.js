import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "dotenv/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: "0.8.28",
  networks: {
    localhost: {
      type: "http",
      url: process.env.HARDHAT_NETWORK_URL || "http://127.0.0.1:8545",
    },
  },
});
