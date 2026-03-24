/**
 * Payment Routes
 * API endpoints for payment processing and management
 */

import express, { Router } from "express";
import { paymentController } from "../controllers/PaymentController";
import { authenticateToken, requireRole } from "../middleware/auth";
import { UserRole } from "../models/User";
import { validatePayment } from "../middleware/validation";
import { rateLimit } from "express-rate-limit";

const router: Router = express.Router();

// Rate limiting for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 payment requests per windowMs
  message: "Too many payment attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const refundLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 refund requests per hour
  message: "Too many refund requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route POST /api/payments/intent
 * @desc Create payment intent
 * @access Private
 */
router.post(
  "/intent",
  authenticateToken,
  paymentLimiter,
  validatePayment,
  (req, res, next) => paymentController.createPaymentIntent(req, res),
);

/**
 * @route POST /api/payments/stellar/create
 * @desc Create Stellar payment transaction
 * @access Private
 */
router.post(
  "/stellar/create",
  authenticateToken,
  paymentLimiter,
  (req, res, next) => paymentController.createStellarPayment(req, res),
);

/**
 * @route POST /api/payments/stellar/submit
 * @desc Submit Stellar payment transaction
 * @access Private
 */
router.post(
  "/stellar/submit",
  authenticateToken,
  paymentLimiter,
  (req, res, next) => paymentController.submitStellarPayment(req, res),
);

/**
 * @route GET /api/payments/:id
 * @desc Get payment details
 * @access Private
 */
router.get("/:id", authenticateToken, (req, res, next) => paymentController.getPaymentById(req, res));

/**
 * @route GET /api/payments/enrollment/:enrollmentId
 * @desc Get payments for enrollment
 * @access Private
 */
router.get(
  "/enrollment/:enrollmentId",
  authenticateToken,
  (req, res, next) => paymentController.getEnrollmentPayments(req, res),
);

/**
 * @route GET /api/payments/history
 * @desc Get user payment history
 * @access Private
 */
router.get(
  "/history",
  authenticateToken,
  (req, res, next) => paymentController.getUserPaymentHistory(req, res),
);

/**
 * @route POST /api/payments/:id/refund
 * @desc Process refund
 * @access Private (Admin only)
 */
router.post(
  "/:id/refund",
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  refundLimiter,
  (req, res, next) => paymentController.processRefund(req, res),
);

/**
 * @route GET /api/payments/receipt/:paymentId
 * @desc Generate payment receipt
 * @access Private
 */
router.get(
  "/receipt/:paymentId",
  authenticateToken,
  (req, res, next) => paymentController.generateReceipt(req, res),
);

/**
 * @route GET /api/payments/settings
 * @desc Get payment settings
 * @access Public
 */
router.get("/settings", (req, res, next) => paymentController.getPaymentSettings(req, res));

/**
 * @route PUT /api/payments/settings
 * @desc Update payment settings
 * @access Private (Admin only)
 */
router.put(
  "/settings",
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  (req, res, next) => paymentController.updatePaymentSettings(req, res),
);

/**
 * @route GET /api/payments/methods
 * @desc Get supported payment methods
 * @access Public
 */
router.get("/methods", (req, res, next) => paymentController.getSupportedPaymentMethods(req, res));

/**
 * @route POST /api/payments/validate
 * @desc Validate payment parameters
 * @access Private
 */
router.post(
  "/validate",
  authenticateToken,
  (req, res, next) => paymentController.validatePaymentParameters(req, res),
);

/**
 * @route GET /api/payments/analytics
 * @desc Get payment analytics
 * @access Private (Admin only)
 */
router.get(
  "/analytics",
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  (req, res, next) => paymentController.getPaymentAnalytics(req, res),
);

/**
 * @route GET /api/payments/exchange-rates
 * @desc Get exchange rates
 * @access Public
 */
router.get("/exchange-rates", (req, res, next) => paymentController.getExchangeRates(req, res));

/**
 * @route POST /api/payments/convert
 * @desc Convert currency amount
 * @access Private
 */
router.post("/convert", authenticateToken, (req, res, next) => paymentController.convertCurrency(req, res));

/**
 * @route GET /api/payments/stellar/balance/:address
 * @desc Get Stellar account balance
 * @access Private
 */
router.get(
  "/stellar/balance/:address",
  authenticateToken,
  (req, res, next) => paymentController.getStellarBalance(req, res),
);

/**
 * @route GET /api/payments/stellar/transactions/:address
 * @desc Get Stellar payment history
 * @access Private
 */
router.get(
  "/stellar/transactions/:address",
  authenticateToken,
  (req, res, next) => paymentController.getStellarTransactionHistory(req, res),
);

/**
 * @route POST /api/payments/webhook/stellar
 * @desc Handle Stellar webhook
 * @access Public
 */
router.post("/webhook/stellar", (req, res, next) => paymentController.handleStellarWebhook(req, res));

/**
 * @route POST /api/payments/webhook/payment-gateway
 * @desc Handle payment gateway webhook
 * @access Public
 */
router.post(
  "/webhook/payment-gateway",
  (req, res, next) => paymentController.handlePaymentGatewayWebhook(req, res),
);

export default router;
