// routes/documentRoutes.js
const express = require("express");
const router = express.Router();
const documentController = require("../controllers/documentController");
const authMiddleware = require("../middlewares/authMiddleware");

// Main page route
router.get("/mainDocument", authMiddleware, (req, res) => {
  res.sendFile("mainDocument.html", { root: "./views/approvals/documents" }); // Serve the submit document page
});
// Submit document route
router.get("/submitDocument", authMiddleware, (req, res) => {
  res.sendFile("submitDocument.html", { root: "./views/approvals/documents" }); // Serve the submit document page
});

router.post("/submitDocument", authMiddleware, documentController.submitDocument);

// Approve document route
router.get("/approveDocument", authMiddleware, documentController.getPendingDocument);
router.post("/approveDocument/:id", authMiddleware, documentController.approveDocument);

// View approved documents route
router.get("/viewApprovedDocument", authMiddleware, documentController.getApprovedDocument);

// API routes to fetch documents
router.get("/api/pendingDocument", authMiddleware, documentController.getPendingDocumentApi);
router.get("/api/approvedDocument", authMiddleware, documentController.getApprovedDocumentApi);

router.post("/deleteDocument/:id", authMiddleware, documentController.deleteDocument);

module.exports = router;
