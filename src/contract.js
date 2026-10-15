import { Contract } from "ethers";

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 31337);

export const REGISTRY_ABI = [
  "function owner() view returns (address)",
  "function authorizedIssuers(address) view returns (bool)",
  "function setIssuerAuthorization(address issuer, bool authorized)",
  "function registerDocument(bytes32 documentHash, string documentId, string ipfsCid)",
  "function getDocument(bytes32 documentHash) view returns (tuple(string documentId,address issuer,uint64 registeredAt,string ipfsCid,bool revoked,bool exists))",
  "function getIssuerDocuments(address issuer) view returns (bytes32[])",
  "function revokeDocument(bytes32 documentHash)",
  "event DocumentRegistered(bytes32 indexed documentHash,string documentId,address indexed issuer,uint64 registeredAt,string ipfsCid)",
  "event IssuerAuthorizationChanged(address indexed issuer,bool authorized)",
  "event DocumentRevoked(bytes32 indexed documentHash,address indexed issuer)",
];

export function createRegistry(signer) {
  if (!CONTRACT_ADDRESS) {
    throw new Error("Deploy the contract locally first (npm run deploy:local).");
  }
  return new Contract(CONTRACT_ADDRESS, REGISTRY_ABI, signer);
}
