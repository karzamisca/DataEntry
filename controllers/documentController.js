// controllers/documentController.js
const Document = require("../models/Document");
const User = require("../models/User");
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const ProposalDocument = require("../models/ProposalDocument");
const ProcessingDocument = require("../models/ProcessingDocument");
const path = require("path");

exports.submitDocument = async (req, res) => {
  const {
    title,
    contentName,
    contentText,
    products,
    approvers,
    approvedDocuments,
  } = req.body;

  try {
    // Ensure approvers is always an array
    const approversArray = Array.isArray(approvers) ? approvers : [approvers];

    // Fetch approver details
    const approverDetails = await Promise.all(
      approversArray.map(async (approverId) => {
        const approver = await User.findById(approverId);
        return {
          approver: approverId,
          username: approver.username,
          subRole: req.body[`subRole_${approverId}`],
        };
      })
    );

    // Check the document type and build accordingly
    let newDocument;
    if (title === "Proposal Document") {
      // Creating a Proposal Document with specific fields
      newDocument = new ProposalDocument({
        title,
        maintenance: req.body.maintenance,
        costCenter: req.body.costCenter,
        dateOfError: req.body.dateOfError,
        errorDescription: req.body.errorDescription,
        direction: req.body.direction,
        submittedBy: req.user.id,
        approvers: approverDetails,
        submissionDate: moment()
          .tz("Asia/Bangkok")
          .format("YYYY-MM-DD HH:mm:ss"),
      });
    } else {
      // Creating a Generic Document with existing fields
      const contentArray = [];

      // Build content array with both name and text
      if (Array.isArray(contentName) && Array.isArray(contentText)) {
        contentName.forEach((name, index) => {
          contentArray.push({ name, text: contentText[index] });
        });
      } else if (title === "Processing Document") {
        const productEntries = products.map((product) => ({
          ...product,
          totalCost: product.costPerUnit * product.amount,
        }));
        const grandTotalCost = productEntries.reduce(
          (acc, product) => acc + product.totalCost,
          0
        );

        const newProcessingDocument = new ProcessingDocument({
          title,
          products: productEntries,
          grandTotalCost,
          submissionDate: moment()
            .tz("Asia/Bangkok")
            .format("YYYY-MM-DD HH:mm:ss"),
          submittedBy: req.user.id,
          approvers: approverDetails,
        });

        await newProcessingDocument.save();
        return res.redirect("/mainDocument");
      } else {
        contentArray.push({ name: contentName, text: contentText });
      }

      // Append content from selected approved documents
      if (approvedDocuments && approvedDocuments.length > 0) {
        const approvedDocs = await Document.find({
          _id: { $in: approvedDocuments },
        });
        approvedDocs.forEach((doc) => {
          contentArray.push(...doc.content); // Append each content item from approved docs
        });
      }

      newDocument = new Document({
        title,
        content: contentArray,
        submittedBy: req.user.id,
        approvers: approverDetails,
        submissionDate: moment()
          .tz("Asia/Bangkok")
          .format("YYYY-MM-DD HH:mm:ss"),
      });
    }

    await newDocument.save();
    res.redirect("/mainDocument");
  } catch (err) {
    console.error("Error submitting document:", err);
    res.status(500).send("Error submitting document");
  }
};

exports.getPendingDocument = async (req, res) => {
  try {
    const pendingProposalDocs = await ProposalDocument.find({
      approved: false,
    }).populate("submittedBy", "username");
    const pendingGenericDocs = await Document.find({
      approved: false,
    }).populate("submittedBy", "username");

    // Serve the static HTML file and pass documents as JSON
    res.sendFile(
      path.join(__dirname, "../views/approvals/documents/approveDocument.html"),
      {
        pendingGenericDocs: JSON.stringify(pendingGenericDocs),
        pendingProposalDocs: JSON.stringify(pendingProposalDocs),
      }
    );
  } catch (err) {
    console.error("Error fetching pending documents:", err);
    res.status(500).send("Error fetching pending documents");
  }
};

exports.approveDocument = async (req, res) => {
  const { id } = req.params;

  try {
    if (req.user.role !== "approver") {
      return res
        .status(403)
        .send("Access denied. Only approvers can approve documents.");
    }

    // Check if the document is a Generic, Proposal, or Processing Document
    let document =
      (await Document.findById(id)) ||
      (await ProposalDocument.findById(id)) ||
      (await ProcessingDocument.findById(id));

    if (!document) {
      return res.status(404).send("Document not found");
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).send("User not found");
    }

    const isChosenApprover = document.approvers.some(
      (approver) => approver.approver.toString() === req.user.id
    );

    if (!isChosenApprover) {
      return res
        .status(403)
        .send("You are not an assigned approver for this document.");
    }

    const hasApproved = document.approvedBy.some(
      (approver) => approver.user.toString() === req.user.id
    );

    if (hasApproved) {
      return res.status(400).send("You have already approved this document.");
    }

    // Add the current approver to the list of `approvedBy`
    document.approvedBy.push({
      user: user.id,
      username: user.username,
      role: user.role,
      approvalDate: new Date().toISOString(),
    });

    // If all approvers have approved, mark it as fully approved
    if (document.approvedBy.length === document.approvers.length) {
      document.approved = true;
    }

    // Save document in the correct collection
    if (document instanceof ProcessingDocument) {
      await ProcessingDocument.findByIdAndUpdate(id, document);
    } else if (document instanceof ProposalDocument) {
      await ProposalDocument.findByIdAndUpdate(id, document);
    } else {
      await Document.findByIdAndUpdate(id, document);
    }

    res.redirect("/approveDocument");
  } catch (err) {
    console.error("Error approving document:", err);
    res.status(500).send("Error approving document");
  }
};

exports.getApprovedDocument = async (req, res) => {
  try {
    const approvedGenericDocs = await Document.find({
      approved: true,
    }).populate("submittedBy", "username");
    const approvedProposalDocs = await ProposalDocument.find({
      approved: true,
    }).populate("submittedBy", "username");
    const approvedProcessingDocs = await ProcessingDocument.find({
      approved: true,
    }).populate("submittedBy", "username");

    // Serve the static HTML file and pass documents as JSON
    res.sendFile(
      path.join(
        __dirname,
        "../views/approvals/documents/viewApprovedDocument.html"
      ),
      {
        approvedGenericDocs: JSON.stringify(approvedGenericDocs),
        approvedProposalDocs: JSON.stringify(approvedProposalDocs),
        approvedProcessingDocs: JSON.stringify(approvedProcessingDocs),
      }
    );
  } catch (err) {
    console.error("Error fetching approved documents:", err);
    res.status(500).send("Error fetching approved documents");
  }
};

exports.getPendingDocumentApi = async (req, res) => {
  try {
    // Fetch pending generic documents
    const pendingGenericDocs = await Document.find({
      approved: false,
    }).populate("submittedBy", "username");

    // Fetch pending proposal documents
    const pendingProposalDocs = await ProposalDocument.find({
      approved: false,
    }).populate("submittedBy", "username");

    // Fetch pending processing documents
    const pendingProcessingDocs = await ProcessingDocument.find({
      approved: false,
    }).populate("submittedBy", "username");

    // Combine both document types into a single array
    const pendingDocuments = [
      ...pendingGenericDocs,
      ...pendingProposalDocs,
      ...pendingProcessingDocs,
    ];

    // Return combined pending documents as JSON
    res.json(pendingDocuments);
  } catch (err) {
    console.error("Error fetching pending documents:", err);
    res.status(500).send("Error fetching pending documents");
  }
};

exports.getApprovedDocumentApi = async (req, res) => {
  try {
    // Fetch approved generic documents
    const approvedGenericDocs = await Document.find({
      approved: true,
    }).populate("submittedBy", "username");

    // Fetch approved proposal documents
    const approvedProposalDocs = await ProposalDocument.find({
      approved: true,
    }).populate("submittedBy", "username");

    // Fetch approved proposal documents
    const approvedProcessingDocs = await ProcessingDocument.find({
      approved: true,
    }).populate("submittedBy", "username");

    // Combine both document types into a single array
    const approvedDocuments = [
      ...approvedGenericDocs,
      ...approvedProposalDocs,
      ...approvedProcessingDocs,
    ];

    // Return combined approved documents as JSON
    res.json(approvedDocuments);
  } catch (err) {
    console.error("Error fetching approved documents:", err);
    res.status(500).send("Error fetching approved documents");
  }
};

exports.deleteDocument = async (req, res) => {
  const { id } = req.params;

  try {
    if (req.user.role !== "approver") {
      return res
        .status(403)
        .send("Access denied. Only approvers can delete documents.");
    }
    // Attempt to find the document in both collections
    let document = await Document.findById(id);
    let isProposalDocument = false;

    if (!document) {
      document = await ProposalDocument.findById(id);
      isProposalDocument = true;
    }

    if (!document) {
      return res.status(404).send("Document not found");
    }

    // Delete the document based on its type
    if (isProposalDocument) {
      await ProposalDocument.findByIdAndDelete(id);
    } else {
      await Document.findByIdAndDelete(id);
    }

    res.redirect("/approveDocument"); // Redirect after deletion
  } catch (err) {
    console.error("Error deleting document:", err);
    res.status(500).send("Error deleting document");
  }
};
