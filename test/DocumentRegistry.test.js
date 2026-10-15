import { expect } from "chai";
import { id } from "ethers";
import { network } from "hardhat";

describe("DocumentRegistry", function () {
  async function deployRegistry() {
    const { ethers } = await network.create();
    const [owner, issuer, stranger] = await ethers.getSigners();
    const registry = await ethers.deployContract("DocumentRegistry");
    return { registry, owner, issuer, stranger };
  }

  const documentHash = id("sample-pdf-content");

  it("authorizes issuers only when the owner changes authorization", async function () {
    const { registry, owner, issuer, stranger } = await deployRegistry();

    await expect(registry.connect(stranger).setIssuerAuthorization(issuer.address, true))
      .to.be.revertedWith("Only owner");
    await expect(registry.setIssuerAuthorization(issuer.address, true))
      .to.emit(registry, "IssuerAuthorizationChanged")
      .withArgs(issuer.address, true);
    expect(await registry.authorizedIssuers(issuer.address)).to.equal(true);
    expect(await registry.owner()).to.equal(owner.address);
  });

  it("allows the owner and authorized issuers to register document metadata", async function () {
    const { registry, owner, issuer } = await deployRegistry();
    await registry.setIssuerAuthorization(issuer.address, true);

    await expect(registry.connect(issuer).registerDocument(documentHash, "DOC-001", "bafy-demo"))
      .to.emit(registry, "DocumentRegistered")
      .withArgs(documentHash, "DOC-001", issuer.address, (value) => value > 0, "bafy-demo");

    const document = await registry.getDocument(documentHash);
    expect(document.documentId).to.equal("DOC-001");
    expect(document.issuer).to.equal(issuer.address);
    expect(document.ipfsCid).to.equal("bafy-demo");
    expect(document.exists).to.equal(true);
    expect(await registry.getIssuerDocuments(issuer.address)).to.deep.equal([documentHash]);

    await registry.registerDocument(id("owner-document"), "DOC-OWNER", "");
    expect((await registry.getDocument(id("owner-document"))).issuer).to.equal(owner.address);
  });

  it("rejects unauthorized issuers, duplicate hashes, duplicate IDs, and empty IDs", async function () {
    const { registry, issuer, stranger } = await deployRegistry();

    await expect(registry.connect(stranger).registerDocument(documentHash, "DOC-001", ""))
      .to.be.revertedWith("Not an authorized issuer");
    await registry.setIssuerAuthorization(issuer.address, true);
    await registry.connect(issuer).registerDocument(documentHash, "DOC-001", "");

    await expect(registry.connect(issuer).registerDocument(documentHash, "DOC-002", ""))
      .to.be.revertedWith("Document already registered");
    await expect(registry.connect(issuer).registerDocument(id("other"), "DOC-001", ""))
      .to.be.revertedWith("Document ID already used");
    await expect(registry.connect(issuer).registerDocument(id("third"), "", ""))
      .to.be.revertedWith("Document ID required");
  });

  it("returns an empty record for an unknown hash", async function () {
    const { registry } = await deployRegistry();
    const document = await registry.getDocument(id("missing"));
    expect(document.exists).to.equal(false);
  });

  it("allows the original issuer or owner to revoke and prevents repeat revocation", async function () {
    const { registry, issuer, stranger } = await deployRegistry();
    await registry.setIssuerAuthorization(issuer.address, true);
    await registry.connect(issuer).registerDocument(documentHash, "DOC-001", "");

    await expect(registry.connect(stranger).revokeDocument(documentHash))
      .to.be.revertedWith("Not the document issuer");
    await expect(registry.connect(issuer).revokeDocument(documentHash))
      .to.emit(registry, "DocumentRevoked")
      .withArgs(documentHash, issuer.address);
    expect((await registry.getDocument(documentHash)).revoked).to.equal(true);
    await expect(registry.connect(issuer).revokeDocument(documentHash))
      .to.be.revertedWith("Document already revoked");
    await expect(registry.revokeDocument(id("missing")))
      .to.be.revertedWith("Document not found");
  });
});
