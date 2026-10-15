import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, isAddress } from "ethers";
import {
  CHAIN_ID,
  CONTRACT_ADDRESS,
  createRegistry,
} from "./contract.js";

const navigation = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "verify", label: "Verify a document", icon: "✓" },
  { id: "records", label: "My records", icon: "▤" },
];

function shortenAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

function formatDate(timestamp) {
  const seconds = Number(timestamp);
  return seconds ? new Date(seconds * 1000).toLocaleString() : "Not available";
}

async function hashFile(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function isPdf(file) {
  return file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
}

function StatusPill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-600",
    good: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    bad: "bg-rose-50 text-rose-700",
    blue: "bg-blue-50 text-brand",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function Icon({ children, className = "" }) {
  return <span aria-hidden="true" className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-lg text-brand ${className}`}>{children}</span>;
}

function Field({ label, children, hint }) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-5 text-slate">{hint}</span>}
    </label>
  );
}

function App() {
  const [activePage, setActivePage] = useState("overview");
  const [account, setAccount] = useState("");
  const [networkId, setNetworkId] = useState(null);
  const [contract, setContract] = useState(null);
  const [owner, setOwner] = useState("");
  const [isIssuer, setIsIssuer] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [ipfsConfigured, setIpfsConfigured] = useState(false);
  const [ipfsServiceAvailable, setIpfsServiceAvailable] = useState(false);
  const [file, setFile] = useState(null);
  const [registerForm, setRegisterForm] = useState(null);
  const [documentId, setDocumentId] = useState("");
  const [uploadToIpfs, setUploadToIpfs] = useState(false);
  const [verifyFile, setVerifyFile] = useState(null);
  const [verification, setVerification] = useState(null);
  const [issuerAddress, setIssuerAddress] = useState("");
  const [verifyHash, setVerifyHash] = useState("");

  const correctNetwork = networkId === BigInt(CHAIN_ID);
  const isOwner = Boolean(account && owner && account.toLowerCase() === owner.toLowerCase());
  const canIssue = correctNetwork && (isOwner || isIssuer);

  const walletLabel = useMemo(() => {
    if (!account) return "Connect wallet";
    if (!correctNetwork) return "Switch to local network";
    return shortenAddress(account);
  }, [account, correctNetwork]);

  const loadIssuerDocuments = useCallback(async (activeContract, activeAccount) => {
    if (!activeContract || !activeAccount) {
      setDocuments([]);
      return;
    }
    const hashes = await activeContract.getIssuerDocuments(activeAccount);
    const records = await Promise.all(
      hashes.map(async (hash) => {
        const document = await activeContract.getDocument(hash);
        return {
          hash,
          documentId: document.documentId,
          issuer: document.issuer,
          registeredAt: document.registeredAt,
          ipfsCid: document.ipfsCid,
          revoked: document.revoked,
          exists: document.exists,
        };
      }),
    );
    setDocuments(records.reverse());
  }, []);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setNotice({ type: "error", message: "MetaMask was not found. Install the MetaMask browser extension and try again." });
      return;
    }
    setIsConnecting(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts.length) throw new Error("MetaMask did not return an account.");
      await switchToLocalNetwork();
      const network = await provider.getNetwork();
      setAccount(accounts[0]);
      setNetworkId(network.chainId);
      const activeContract = createRegistry(await provider.getSigner());
      setContract(activeContract);
      const [contractOwner, issuerAllowed] = await Promise.all([
        activeContract.owner(),
        activeContract.authorizedIssuers(accounts[0]),
      ]);
      setOwner(contractOwner);
      setIsIssuer(issuerAllowed);
      await loadIssuerDocuments(activeContract, accounts[0]);
      setNotice({
        type: network.chainId === BigInt(CHAIN_ID) ? "success" : "warning",
        message: network.chainId === BigInt(CHAIN_ID)
          ? "Wallet connected to the local verification network."
          : `Connected to chain ${network.chainId}. Switch MetaMask to local chain ${CHAIN_ID}.`,
      });
    } catch (error) {
      setNotice({ type: "error", message: error?.shortMessage || error?.message || "Wallet connection failed." });
    } finally {
      setIsConnecting(false);
    }
  }, [loadIssuerDocuments]);

  async function switchToLocalNetwork() {
    const chainId = `0x${BigInt(CHAIN_ID).toString(16)}`;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (error) {
      if (error.code !== 4902) throw error;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: "Hardhat Local",
          nativeCurrency: { name: "Hardhat ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["http://127.0.0.1:8545"],
        }],
      });
    }
  }

  useEffect(() => {
    if (!window.ethereum) return undefined;
    const handleAccountsChanged = () => {
      setAccount("");
      setContract(null);
      setOwner("");
      setIsIssuer(false);
      setDocuments([]);
      setVerification(null);
    };
    const handleChainChanged = () => window.location.reload();
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:3001"}/api/ipfs/status`)
      .then(async (response) => {
        if (!response.ok) throw new Error("IPFS service unavailable");
        const status = await response.json();
        setIpfsConfigured(status.configured);
        setIpfsServiceAvailable(true);
      })
      .catch(() => {
        setIpfsConfigured(false);
        setIpfsServiceAvailable(false);
      });
  }, []);

  const refreshRecords = useCallback(async () => {
    if (!contract || !account) return;
    try {
      await loadIssuerDocuments(contract, account);
    } catch (error) {
      setNotice({ type: "error", message: `Could not load registered documents: ${error.message}` });
    }
  }, [account, contract, loadIssuerDocuments]);

  async function handleRegister(event) {
    event.preventDefault();
    setNotice(null);
    if (!contract || !canIssue) {
      setNotice({ type: "error", message: "Connect an authorized issuer wallet on the local network before registering." });
      return;
    }
    if (!isPdf(file)) {
      setNotice({ type: "error", message: "Choose a PDF file to register." });
      return;
    }
    const cleanId = documentId.trim();
    if (!cleanId) {
      setNotice({ type: "error", message: "Enter a unique document ID." });
      return;
    }

    setBusy("register");
    try {
      const hash = await hashFile(file);
      let cid = "";
      let uploadWarning = "";
      if (uploadToIpfs) {
        try {
          const body = new FormData();
          body.append("file", file);
          const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:3001"}/api/ipfs/upload`, {
            method: "POST",
            body,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "IPFS upload failed.");
          cid = result.cid;
        } catch (error) {
          uploadWarning = `IPFS upload failed; registering only the hash on-chain instead. ${error.message}`;
        }
      }
      const transaction = await contract.registerDocument(hash, cleanId, cid);
      const receipt = await transaction.wait();
      setNotice({
        type: uploadWarning ? "warning" : "success",
        message: uploadWarning
          ? `${uploadWarning} Transaction: ${transaction.hash}`
          : `Document registered. Transaction: ${transaction.hash}`,
      });
      setFile(null);
      setDocumentId("");
      registerForm?.reset();
      await loadIssuerDocuments(contract, account);
      setVerification({
        status: "registered",
        hash,
        document: await contract.getDocument(hash),
        transactionHash: receipt.hash,
      });
    } catch (error) {
      setNotice({ type: "error", message: error?.shortMessage || error?.message || "Document registration failed." });
    } finally {
      setBusy("");
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    setVerification(null);
    setNotice(null);
    if (!contract) {
      setNotice({ type: "error", message: "Connect MetaMask and deploy the contract locally before verifying." });
      return;
    }
    if (!isPdf(verifyFile)) {
      setNotice({ type: "error", message: "Choose a PDF file to verify." });
      return;
    }
    setBusy("verify");
    try {
      const hash = await hashFile(verifyFile);
      setVerifyHash(hash);
      const document = await contract.getDocument(hash);
      if (!document.exists) {
        setVerification({ status: "unknown", hash });
      } else if (document.revoked) {
        setVerification({ status: "revoked", hash, document });
      } else {
        const filter = contract.filters.DocumentRegistered(hash);
        const events = await contract.queryFilter(filter);
        const transactionHash = events.at(-1)?.transactionHash || "";
        setVerification({ status: "verified", hash, document, transactionHash });
      }
    } catch (error) {
      setNotice({ type: "error", message: error?.shortMessage || error?.message || "Document verification failed." });
    } finally {
      setBusy("");
    }
  }

  async function handleIssuerChange(event) {
    event.preventDefault();
    setNotice(null);
    if (!contract || !isOwner) {
      setNotice({ type: "error", message: "Only the contract owner can manage issuers." });
      return;
    }
    if (!isAddress(issuerAddress)) {
      setNotice({ type: "error", message: "Enter a valid wallet address." });
      return;
    }
    setBusy("issuer");
    try {
      const authorized = event.nativeEvent.submitter?.value === "authorize";
      const transaction = await contract.setIssuerAuthorization(issuerAddress, authorized);
      await transaction.wait();
      setNotice({
        type: "success",
        message: `Issuer ${authorized ? "authorized" : "removed"}. Transaction: ${transaction.hash}`,
      });
      setIssuerAddress("");
      if (issuerAddress.toLowerCase() === account.toLowerCase()) setIsIssuer(authorized);
    } catch (error) {
      setNotice({ type: "error", message: error?.shortMessage || error?.message || "Issuer update failed." });
    } finally {
      setBusy("");
    }
  }

  async function handleRevoke(hash) {
    if (!contract) return;
    setBusy(`revoke-${hash}`);
    setNotice(null);
    try {
      const transaction = await contract.revokeDocument(hash);
      await transaction.wait();
      setNotice({ type: "success", message: `Document revoked. Transaction: ${transaction.hash}` });
      await refreshRecords();
    } catch (error) {
      setNotice({ type: "error", message: error?.shortMessage || error?.message || "Revocation failed." });
    } finally {
      setBusy("");
    }
  }

  const verificationStatus = verification?.status;
  const resultTone = verificationStatus === "verified" || verificationStatus === "registered"
    ? "good"
    : verificationStatus === "revoked" ? "bad" : "warning";

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-white px-5 py-6 lg:flex">
        <a href="#" onClick={(event) => { event.preventDefault(); setActivePage("overview"); }} className="mb-11 flex items-center gap-3 px-2 no-underline">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-lg font-bold text-white">D</span>
          <span><strong className="block text-base tracking-tight text-ink">DocuVerify</strong><small className="text-xs text-slate">Trust, made verifiable</small></span>
        </a>
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate">Workspace</p>
        <nav aria-label="Main navigation" className="space-y-1">
          {navigation.map((item) => (
            <button key={item.id} onClick={() => setActivePage(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${activePage === item.id ? "bg-blue-50 text-brand" : "text-slate hover:bg-slate-50 hover:text-ink"}`}>
              <span className="w-5 text-center text-lg" aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-line bg-canvas p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink"><Icon className="h-7 w-7 text-sm">◈</Icon>Local demo network</div>
          <p className="mb-0 mt-3 text-xs leading-5 text-slate">Documents are verified against your local Hardhat blockchain.</p>
          <p className="mb-0 mt-2 truncate font-mono text-[10px] text-slate" title={CONTRACT_ADDRESS || "Contract not deployed"}>{CONTRACT_ADDRESS || "Contract not deployed yet"}</p>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-10 flex min-h-[76px] items-center justify-between border-b border-line bg-white/90 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white lg:hidden">D</span>
            <div><p className="mb-0 text-xs font-medium text-slate">University document registry</p><p className="mb-0 mt-0.5 text-sm font-semibold text-ink">Secure verification portal</p></div>
          </div>
          <div className="flex items-center gap-3">
            {account && <span className="hidden rounded-full bg-slate-50 px-3 py-2 text-xs font-medium text-slate sm:inline-flex">{correctNetwork ? "Local network" : `Wrong network · ${networkId}`}</span>}
            <button onClick={connectWallet} disabled={isConnecting} className="btn-primary">
              <span aria-hidden="true">◉</span>{isConnecting ? "Connecting…" : walletLabel}
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <nav aria-label="Mobile navigation" className="mb-6 flex gap-2 overflow-x-auto lg:hidden">
            {navigation.map((item) => <button key={item.id} onClick={() => setActivePage(item.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${activePage === item.id ? "bg-brand text-white" : "bg-white text-slate"}`}>{item.label}</button>)}
          </nav>

          {notice && <div role="status" className={`mb-6 flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : notice.type === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            <span className="break-all leading-6">{notice.message}</span>
            <button aria-label="Dismiss message" onClick={() => setNotice(null)} className="shrink-0 font-semibold">×</button>
          </div>}

          {activePage === "overview" && (
            <>
              <section className="mb-8 flex flex-col justify-between gap-6 rounded-3xl bg-gradient-to-r from-[#192a50] to-[#294783] px-6 py-8 text-white sm:px-9 sm:py-9 xl:flex-row xl:items-center">
                <div className="max-w-xl">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Document integrity, made simple</p>
                  <h1 className="mb-3 text-3xl font-semibold tracking-tight sm:text-4xl">A trusted record for every document.</h1>
                  <p className="mb-0 max-w-lg text-sm leading-6 text-blue-100">Register a document fingerprint on the blockchain. Verify the original later—without putting the document itself on-chain.</p>
                </div>
                <button onClick={() => setActivePage("verify")} className="flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-blue-50 xl:self-center">Verify a document <span aria-hidden="true">→</span></button>
              </section>

              <section className="mb-8 grid gap-4 sm:grid-cols-3">
                <div className="stat-card"><span className="stat-label">Wallet status</span><strong className="mt-3 block text-lg">{account ? "Connected" : "Not connected"}</strong><span className="mt-1 block truncate text-xs text-slate">{account ? shortenAddress(account) : "Connect MetaMask to begin"}</span></div>
                <div className="stat-card"><span className="stat-label">Your records</span><strong className="mt-3 block text-lg">{documents.length}</strong><span className="mt-1 block text-xs text-slate">Registered by this account</span></div>
                <div className="stat-card"><span className="stat-label">Issuer access</span><strong className="mt-3 block text-lg">{isOwner ? "Contract owner" : isIssuer ? "Authorized issuer" : "Verification only"}</strong><span className="mt-1 block text-xs text-slate">{correctNetwork ? "Connected to local chain" : account ? "Switch to the local chain" : "Connect your wallet to check"}</span></div>
              </section>

              <section className="grid items-start gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="panel">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div className="flex gap-3"><Icon>＋</Icon><div><h2 className="section-title">Register a document</h2><p className="section-caption">Create a permanent proof of authenticity</p></div></div>
                    {!canIssue && <StatusPill tone="warning">Issuer access required</StatusPill>}
                  </div>
                  <form ref={setRegisterForm} onSubmit={handleRegister} className="space-y-5">
                    <Field label="Document ID" hint="Choose a unique reference, such as CERT-2026-0042.">
                      <input className="form-input" value={documentId} onChange={(event) => setDocumentId(event.target.value)} placeholder="e.g. CERT-2026-0042" autoComplete="off" />
                    </Field>
                    <Field label="PDF document" hint="The file is hashed in your browser. Only its fingerprint and minimal details are stored on-chain.">
                      <input className="form-input file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand" type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                    </Field>
                    <div className={`rounded-xl border px-4 py-3 ${ipfsConfigured ? "border-line bg-white" : "border-dashed border-line bg-slate-50"}`}>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" checked={uploadToIpfs} disabled={!ipfsConfigured} onChange={(event) => setUploadToIpfs(event.target.checked)} className="mt-1 accent-brand" />
                        <span><strong className="block text-sm font-semibold">Also upload to IPFS</strong><span className="mt-1 block text-xs leading-5 text-slate">{ipfsConfigured ? "Optional: pin a retrievable copy via the configured server-side provider." : ipfsServiceAvailable ? "IPFS is not configured; local registration works without it." : "Optional IPFS service is not running; local registration works without it."}</span></span>
                      </label>
                    </div>
                    <button disabled={busy === "register" || !canIssue} className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50">
                      {busy === "register" ? "Registering document…" : "Register document on blockchain"}
                    </button>
                  </form>
                </div>

                <div className="panel">
                  <div className="mb-5 flex items-center gap-3"><Icon className="bg-emerald-50 text-emerald-700">✓</Icon><div><h2 className="section-title">How verification works</h2><p className="section-caption">A simple three-step trust check</p></div></div>
                  <ol className="space-y-5">
                    {[
                      ["01", "Create a fingerprint", "Your PDF is hashed locally with SHA-256. Its contents stay on your device."],
                      ["02", "Check the registry", "The fingerprint is compared with the blockchain record."],
                      ["03", "Review the result", "See whether it is authentic, changed, unknown, or revoked."],
                    ].map(([number, title, text]) => <li key={number} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-brand">{number}</span><div><h3 className="mb-1 text-sm font-semibold">{title}</h3><p className="mb-0 text-xs leading-5 text-slate">{text}</p></div></li>)}
                  </ol>
                </div>
              </section>

              {isOwner && (
                <section className="panel mt-6">
                  <div className="mb-5 flex items-center gap-3"><Icon className="bg-violet-50 text-violet-700">♙</Icon><div><h2 className="section-title">Issuer management</h2><p className="section-caption">Owner-only access control for document issuers</p></div><StatusPill tone="blue">Owner</StatusPill></div>
                  <form onSubmit={handleIssuerChange} className="flex flex-col gap-3 sm:flex-row">
                    <input aria-label="Issuer wallet address" className="form-input min-w-0 flex-1" value={issuerAddress} onChange={(event) => setIssuerAddress(event.target.value)} placeholder="0x… issuer wallet address" />
                    <button name="action" value="authorize" disabled={busy === "issuer"} className="btn-primary justify-center">Authorize</button>
                    <button name="action" value="revoke" disabled={busy === "issuer"} className="btn-secondary justify-center">Remove access</button>
                  </form>
                </section>
              )}

              <DocumentList documents={documents} busy={busy} onRevoke={handleRevoke} onVerifyHash={(hash) => { setVerifyHash(hash); setActivePage("verify"); }} />
            </>
          )}

          {activePage === "verify" && (
            <section className="mx-auto max-w-3xl">
              <div className="mb-7"><p className="eyebrow">DOCUMENT CHECK</p><h1 className="mb-2 text-3xl font-semibold tracking-tight">Verify a document</h1><p className="mb-0 text-sm leading-6 text-slate">Upload a PDF to compare its SHA-256 fingerprint with the on-chain registry.</p></div>
              <form onSubmit={handleVerify} className="panel space-y-5">
                <Field label="PDF to verify" hint="The document is read locally and is not uploaded during verification.">
                  <input className="form-input file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand" type="file" accept="application/pdf,.pdf" onChange={(event) => { setVerifyFile(event.target.files?.[0] || null); setVerification(null); }} />
                </Field>
                <button disabled={busy === "verify"} className="btn-primary w-full justify-center">{busy === "verify" ? "Checking the blockchain…" : "Verify document"}</button>
              </form>
              {verification && <div className={`mt-6 rounded-2xl border bg-white p-6 shadow-card ${resultTone === "good" ? "border-emerald-200" : resultTone === "bad" ? "border-rose-200" : "border-amber-200"}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${resultTone === "good" ? "bg-emerald-50 text-emerald-700" : resultTone === "bad" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{resultTone === "good" ? "✓" : resultTone === "bad" ? "×" : "!"}</span>
                  <div><h2 className="mb-1 text-lg font-semibold">{verificationStatus === "verified" ? "Document verified" : verificationStatus === "registered" ? "Document registered" : verificationStatus === "revoked" ? "Document revoked" : "No matching record"}</h2><p className="mb-0 text-sm text-slate">{verificationStatus === "unknown" ? "This PDF fingerprint is not registered. It may be altered or unrecognized." : verificationStatus === "revoked" ? "This document has a record, but its issuer has revoked it." : "The PDF fingerprint matches the active blockchain record."}</p></div>
                </div>
                <dl className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
                  <Detail label="SHA-256 fingerprint"><code className="break-all text-xs">{verification.hash}</code></Detail>
                  {verification.document && <DocumentDetails document={verification.document} />}
                          {verification.transactionHash && <Detail label="Registration transaction"><code className="break-all text-xs">{verification.transactionHash}</code></Detail>}
                </dl>
              </div>}
              {verifyHash && <p className="mt-4 break-all text-xs text-slate">Selected record: <code>{verifyHash}</code></p>}
            </section>
          )}

          {activePage === "records" && (
            <>
              <div className="mb-7"><p className="eyebrow">ISSUER WORKSPACE</p><h1 className="mb-2 text-3xl font-semibold tracking-tight">My registered documents</h1><p className="mb-0 text-sm leading-6 text-slate">Records registered by the wallet currently connected to MetaMask.</p></div>
              <DocumentList documents={documents} busy={busy} onRevoke={handleRevoke} onVerifyHash={(hash) => { setVerifyHash(hash); setActivePage("verify"); }} />
              {!account && <div className="panel mt-6 text-center"><p className="mb-1 text-sm font-semibold">Connect your wallet to view issuer records</p><p className="mb-0 text-sm text-slate">Only records registered by your connected account appear here.</p></div>}
            </>
          )}

          <footer className="mt-12 flex flex-col justify-between gap-2 border-t border-line py-6 text-xs text-slate sm:flex-row"><span>DocuVerify · College demonstration project</span><span>Local Hardhat network · SHA-256 · Optional IPFS</span></footer>
        </div>
      </main>
    </div>
  );
}

function Detail({ label, children }) {
  return <div className="grid gap-1 sm:grid-cols-[180px_1fr]"><dt className="text-slate">{label}</dt><dd className="m-0 font-medium text-ink">{children}</dd></div>;
}

function DocumentDetails({ document }) {
  return <>
    <Detail label="Document ID">{document.documentId}</Detail>
    <Detail label="Issuer">{document.issuer}</Detail>
    <Detail label="Registered">{formatDate(document.registeredAt)}</Detail>
    {document.ipfsCid && <Detail label="IPFS CID"><a className="break-all text-xs text-brand hover:underline" href={`${(import.meta.env.VITE_IPFS_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs").replace(/\/$/, "")}/${encodeURIComponent(document.ipfsCid)}`} target="_blank" rel="noreferrer">{document.ipfsCid} · Open at configured gateway ↗</a></Detail>}
  </>;
}

function DocumentList({ documents, busy, onRevoke, onVerifyHash }) {
  return (
    <section className="panel mt-6">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><h2 className="section-title">Registered documents</h2><p className="section-caption">Your wallet’s document records on the local chain</p></div>
        <StatusPill tone="blue">{documents.length} {documents.length === 1 ? "record" : "records"}</StatusPill>
      </div>
      {!documents.length ? (
        <div className="rounded-xl border border-dashed border-line bg-slate-50 px-5 py-10 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl text-slate">▤</span>
          <h3 className="mb-1 mt-3 text-sm font-semibold">No documents registered yet</h3>
          <p className="mb-0 text-xs text-slate">Register a PDF as an issuer or connect the wallet that registered it.</p>
        </div>
      ) : <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
        <thead><tr className="border-b border-line text-xs font-semibold text-slate"><th className="pb-3 pr-4">Document</th><th className="pb-3 pr-4">Registered</th><th className="pb-3 pr-4">Status</th><th className="pb-3 text-right">Actions</th></tr></thead>
        <tbody>{documents.map((record) => <tr key={record.hash} className="border-b border-line last:border-0">
          <td className="py-4 pr-4"><strong className="block font-semibold text-ink">{record.documentId}</strong><code className="mt-1 block text-[10px] text-slate">{record.hash.slice(0, 19)}…</code></td>
          <td className="py-4 pr-4 text-xs text-slate">{formatDate(record.registeredAt)}</td>
          <td className="py-4 pr-4"><StatusPill tone={record.revoked ? "bad" : "good"}>{record.revoked ? "Revoked" : "Active"}</StatusPill></td>
          <td className="py-4 text-right"><div className="flex justify-end gap-2"><button onClick={() => onVerifyHash(record.hash)} className="btn-small">Verify</button>{!record.revoked && <button onClick={() => onRevoke(record.hash)} disabled={busy === `revoke-${record.hash}`} className="btn-small-danger">{busy === `revoke-${record.hash}` ? "Revoking…" : "Revoke"}</button>}</div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  );
}

export default App;
