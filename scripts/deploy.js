import { network } from "hardhat";
import { writeFile } from "node:fs/promises";

const { ethers } = await network.create();
const registry = await ethers.deployContract("DocumentRegistry");
await registry.waitForDeployment();

const address = await registry.getAddress();
const chain = await ethers.provider.getNetwork();
const frontendConfig = `VITE_CONTRACT_ADDRESS=${address}\nVITE_CHAIN_ID=${chain.chainId}\n`;

await writeFile(new URL("../.env.local", import.meta.url), frontendConfig);
console.log(`DocumentRegistry deployed to ${address} (chain ID ${chain.chainId})`);
console.log("Updated .env.local for Vite (restart the dev server if it is already running).");
