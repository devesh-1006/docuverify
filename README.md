# DocuVerify

DocuVerify is a college-level document integrity demo. It creates a SHA-256 fingerprint of a PDF in the browser and registers that fingerprint and minimal document metadata in a local Ethereum smart contract. The PDF itself is never written to the blockchain. An optional Pinata IPFS adapter can upload and pin a copy through a small server; the local blockchain workflow works without IPFS credentials or a running API server.

> **Demo-only:** Run this project on the local Hardhat network. Do not use real documents containing private information: a PDF uploaded to IPFS can be publicly retrievable. Do not import Hardhat's published demo accounts into a wallet used for real funds.

## Requirements

- Node.js 22 LTS or newer (npm is included).
- MetaMask in a desktop browser.
- PowerShell on Windows, or a terminal with equivalent npm commands.
- Optional: a Pinata account and server-side JWT to enable IPFS uploads.

## Run the local demo

Open three PowerShell terminals in the project folder. Install dependencies once:

```powershell
npm install
```

### 1. Start the local blockchain

In terminal 1:

```powershell
npm run chain
```

Leave this terminal running. Hardhat prints ten pre-funded development accounts and private keys. They are public demo keys; use only on the local chain.

### 2. Deploy the contract

In terminal 2:

```powershell
npm run deploy:local
```

The command deploys `DocumentRegistry` to `http://127.0.0.1:8545` and writes the address and chain ID to the ignored `.env.local` file. If the local chain is restarted, deploy again: an in-memory Hardhat chain starts fresh and assigns a new contract address. Start or restart Vite after deployment so it reads `.env.local`.

### 3. Start the web application

In terminal 3:

```powershell
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). Press **Connect wallet** and approve MetaMask. The application offers to add or switch to the Hardhat Local network:

| Setting | Value |
| --- | --- |
| Network name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

If MetaMask asks for an account, import one of the accounts and its private key printed by `npm run chain`. Use the first account as the contract owner; it is also an issuer by default. These keys are deliberately public test keys and must never hold real assets.

### Register and verify a sample PDF

1. Connect the first Hardhat account. Confirm the wallet says it is on the local network.
2. On **Overview**, enter a unique document ID, such as `CERT-2026-0001`, and choose a PDF.
3. Select **Register document on blockchain** and confirm the MetaMask transaction.
4. The success message includes the transaction hash. The record appears in **Registered documents** with its issuer, registration time, fingerprint, and active/revoked state.
5. Open **Verify a document**, select the same PDF, and press **Verify document**. The matching active record is verified.
6. To demonstrate an altered or unrecognized file, verify a different PDF (even a one-byte change produces a different fingerprint); it reports no matching record.
7. To test revocation, choose **Revoke** in the issuer's record list, confirm the transaction, and verify the same PDF again. The result is revoked, not verified.

### Test issuer authorization

1. Connect the contract owner's first account.
2. In **Issuer management**, authorize another Hardhat account by entering its address.
3. Switch MetaMask to that second account and connect again. It can register its own records.
4. Switch back to the owner to remove the issuer's access. Only the owner can change authorization.

## IPFS (optional)

The IPFS adapter uses Pinata's compatible `pinFileToIPFS` endpoint. The server-side API token is never embedded in the Vite bundle. Without a token or API server, IPFS is marked unavailable, but local registration and verification remain usable.

1. Copy the example environment file and set a Pinata JWT **in the server-side `IPFS_API_TOKEN` variable only**:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edit `.env` and replace the blank `IPFS_API_TOKEN=` with your credential. Do not prefix the secret with `VITE_`; do not commit `.env`.
2. Optional public settings include `IPFS_API_URL`, `IPFS_GATEWAY_URL`, `VITE_API_BASE_URL`, and `VITE_IPFS_GATEWAY_URL`. Defaults are set in `.env.example`. `VITE_` settings are public configuration, never secrets.
3. Run the API in another terminal:

   ```powershell
   npm run server
   ```

4. Refresh the web app. The registration form now enables **Also upload to IPFS**. Select it to upload and pin the PDF before registration; the returned CID is included in the on-chain record. The upload endpoint accepts PDFs up to 10 MB.
5. A CID is content-addressed, but **is not a persistence guarantee**. Pinning asks a provider to retain the content; keep the Pinata account, plan, and pin active. Removing a pin or losing the provider can make retrieval fail. A gateway link in the verification details works only while a gateway can serve that CID.

If an upload fails, the UI reports the problem and continues with the fingerprint-only on-chain registration. IPFS is optional; verify the result notice to see whether a CID was saved. Never upload confidential documents to a public IPFS pinning service.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run chain` | Start the local Hardhat JSON-RPC blockchain |
| `npm run compile` | Compile the Solidity contract |
| `npm test` | Run the automated Hardhat contract tests |
| `npm run deploy:local` | Deploy to the running local node and write `.env.local` |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the frontend for production |
| `npm run preview` | Preview the built frontend |
| `npm run server` | Start the optional IPFS upload API |

## Project structure

```text
contracts/DocumentRegistry.sol  Issuer access, document records, lookup, and revocation
test/DocumentRegistry.test.js   Automated smart-contract tests
scripts/deploy.js               Local deployment and frontend address configuration
src/App.jsx                     React pages, forms, wallet, registration, and verification
src/contract.js                 Ethers contract ABI and frontend connection
src/index.css                   Tailwind entry and small global styles
src/app.css                     Shared application utility classes
server/index.js                 Optional, credential-protecting IPFS upload API
hardhat.config.js               Hardhat 3, Solidity compiler, and local network settings
vite.config.js                  React and Tailwind 4 Vite plugins
package.json                    Dependencies and development commands
package-lock.json               Reproducible npm dependency versions
.env.example                    Safe configuration template with blank secret
.env.local                      Generated local contract settings (ignored by Git)
```

## Ten concepts to explain in an interview

1. **SHA-256:** A one-way cryptographic hash turns a PDF's exact bytes into a fixed-length fingerprint. A tiny content change changes the digest.
2. **Browser Web Crypto:** `crypto.subtle.digest("SHA-256", ...)` hashes the selected file locally; the document bytes are not sent to the contract.
3. **Smart contract:** Solidity code deployed to an EVM chain stores and enforces the registry rules.
4. **Blockchain transaction:** Registration, issuer changes, and revocation are signed state changes; reading a record is a read-only call.
5. **Wallet and signer:** MetaMask holds the user's account and asks for permission to sign transactions. `ethers.BrowserProvider` connects the app to it.
6. **Access control:** The owner authorizes issuers; only the owner can change that list, and only an authorized issuer can register documents.
7. **Mappings and events:** Mappings provide on-chain lookups, while events make registration and administrative actions discoverable from transaction logs.
8. **IPFS CID and pinning:** A CID identifies content by its address; a pinning provider helps keep that content available. A CID alone does not promise storage forever.
9. **Frontend/backend secrets boundary:** Vite code is public, so the IPFS JWT lives only in the optional Node server's environment.
10. **Local development chain:** Hardhat provides a private throwaway chain and test accounts, letting you demonstrate transactions safely without a public network.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| MetaMask is missing | Install or enable the MetaMask browser extension, then refresh the Vite page. |
| Wallet cannot reach the local chain | Keep `npm run chain` running. Confirm the RPC URL is `http://127.0.0.1:8545` and chain ID is `31337`. |
| `eth_chainId` / network error | Start the Hardhat node before switching the wallet. Reconnect after MetaMask switches networks. |
| Contract address missing or call fails | Run `npm run deploy:local` while the node is running; restart `npm run dev` afterward so Vite reloads `.env.local`. |
| MetaMask reports insufficient funds | Import a test account printed by the currently running Hardhat node. Do not use a real account. |
| Registration is rejected | Use the owner account or have the owner authorize the connected account. Document IDs and hashes must be unique. |
| PDF appears altered/unrecognized | Confirm you selected the exact original file. Re-exporting or editing a PDF changes its SHA-256 fingerprint. |
| Upload option unavailable | IPFS is optional. Check that `npm run server` is running and `.env` has a valid server-only `IPFS_API_TOKEN`, then refresh. |
| IPFS upload rejected | Check the provider token, Pinata account limits, network access, and the 10 MB upload limit. The local registration can still proceed without a CID. |
| CID link cannot retrieve a file | Check the gateway URL and whether the provider still pins the CID. A public gateway or pin is not guaranteed to remain available. |
| Records disappeared after restarting Hardhat | The local node is ephemeral. Redeploy the contract and register the sample again. |

## Screenshots

Screenshot placeholders for the portfolio: add `dashboard.png`, `verified-document.png`, and `issuer-management.png` under a `screenshots/` folder after running the local demo.
