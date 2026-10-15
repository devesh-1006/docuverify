import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";

const app = express();
const port = Number(process.env.API_PORT || 3001);
const apiToken = process.env.IPFS_API_TOKEN;
const uploadUrl = process.env.IPFS_API_URL || "https://api.pinata.cloud/pinning/pinFileToIPFS";
const gatewayUrl = process.env.IPFS_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs";

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN
    ? [process.env.FRONTEND_ORIGIN]
    : ["http://localhost:5173", "http://127.0.0.1:5173"],
}));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype !== "application/pdf" || !file.originalname.toLowerCase().endsWith(".pdf")) {
      callback(new Error("Only PDF files are accepted."));
      return;
    }
    callback(null, true);
  },
});

app.get("/api/ipfs/status", (_request, response) => {
  response.json({ configured: Boolean(apiToken), gatewayUrl });
});

app.post("/api/ipfs/upload", upload.single("file"), async (request, response) => {
  if (!apiToken) {
    response.status(503).json({ error: "IPFS is not configured. Add IPFS_API_TOKEN to the server environment." });
    return;
  }
  if (!request.file) {
    response.status(400).json({ error: "Select a PDF file to upload." });
    return;
  }

  const providerForm = new FormData();
  providerForm.append(
    "file",
    new Blob([request.file.buffer], { type: "application/pdf" }),
    request.file.originalname,
  );

  try {
    const providerResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: providerForm,
    });
    const result = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      console.error(`IPFS provider rejected upload with HTTP ${providerResponse.status}.`);
      response.status(502).json({ error: `IPFS provider rejected the upload (HTTP ${providerResponse.status}).` });
      return;
    }
    if (typeof result.IpfsHash !== "string" || !result.IpfsHash) {
      console.error("IPFS provider response did not contain an IpfsHash.");
      response.status(502).json({ error: "IPFS provider returned an invalid upload response." });
      return;
    }
    response.json({ cid: result.IpfsHash, gatewayUrl });
  } catch (error) {
    console.error("IPFS upload request failed:", error.message);
    response.status(502).json({ error: "Could not reach the configured IPFS provider." });
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: error.code === "LIMIT_FILE_SIZE" ? "PDF must be 10 MB or smaller." : "Upload could not be accepted.",
    });
    return;
  }
  if (error.message === "Only PDF files are accepted.") {
    response.status(400).json({ error: error.message });
    return;
  }
  console.error("API request failed:", error.message);
  response.status(500).json({ error: "The IPFS API could not process the request." });
});

app.listen(port, () => {
  console.log(`DocuVerify optional IPFS API listening on http://localhost:${port}`);
  if (!apiToken) console.log("IPFS is unconfigured; local blockchain features remain available.");
});
