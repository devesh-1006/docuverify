// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract DocumentRegistry {
    struct Document {
        string documentId;
        address issuer;
        uint64 registeredAt;
        string ipfsCid;
        bool revoked;
        bool exists;
    }

    address public immutable owner;
    mapping(address => bool) public authorizedIssuers;
    mapping(bytes32 => Document) private documents;
    mapping(bytes32 => bytes32) private documentHashById;
    mapping(address => bytes32[]) private issuerDocumentHashes;

    event IssuerAuthorizationChanged(address indexed issuer, bool authorized);
    event DocumentRegistered(
        bytes32 indexed documentHash,
        string documentId,
        address indexed issuer,
        uint64 registeredAt,
        string ipfsCid
    );
    event DocumentRevoked(bytes32 indexed documentHash, address indexed issuer);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyIssuer() {
        require(msg.sender == owner || authorizedIssuers[msg.sender], "Not an authorized issuer");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedIssuers[msg.sender] = true;
        emit IssuerAuthorizationChanged(msg.sender, true);
    }

    function setIssuerAuthorization(address issuer, bool authorized) external onlyOwner {
        require(issuer != address(0), "Invalid issuer");
        authorizedIssuers[issuer] = authorized;
        emit IssuerAuthorizationChanged(issuer, authorized);
    }

    function registerDocument(
        bytes32 documentHash,
        string calldata documentId,
        string calldata ipfsCid
    ) external onlyIssuer {
        require(documentHash != bytes32(0), "Invalid document hash");
        require(bytes(documentId).length > 0, "Document ID required");
        require(!documents[documentHash].exists, "Document already registered");
        bytes32 idHash = keccak256(bytes(documentId));
        require(documentHashById[idHash] == bytes32(0), "Document ID already used");

        uint64 registeredAt = uint64(block.timestamp);
        documents[documentHash] = Document({
            documentId: documentId,
            issuer: msg.sender,
            registeredAt: registeredAt,
            ipfsCid: ipfsCid,
            revoked: false,
            exists: true
        });
        documentHashById[idHash] = documentHash;
        issuerDocumentHashes[msg.sender].push(documentHash);

        emit DocumentRegistered(documentHash, documentId, msg.sender, registeredAt, ipfsCid);
    }

    function getDocument(bytes32 documentHash) external view returns (Document memory) {
        return documents[documentHash];
    }

    function getIssuerDocuments(address issuer) external view returns (bytes32[] memory) {
        return issuerDocumentHashes[issuer];
    }

    function revokeDocument(bytes32 documentHash) external {
        Document storage document = documents[documentHash];
        require(document.exists, "Document not found");
        require(msg.sender == owner || msg.sender == document.issuer, "Not the document issuer");
        require(!document.revoked, "Document already revoked");
        document.revoked = true;
        emit DocumentRevoked(documentHash, msg.sender);
    }
}
