const express = require('express');
const router = express.Router();
const {
  getOverviewStats,
  getDetailedReport,
  getEnrollmentTrends,
  getCompletionRates,
  exportData,
} = require('../controllers/analyticsController');

// Analytics Data Routes
router.get('/overview', getOverviewStats);
router.get('/report', getDetailedReport);

// Real aggregation pipeline (Issue #26).
// Both endpoints are PII-safe by construction (controller-side scrub +
// service-side aggregation that never returns source_account or any user id).
router.get('/enrollment-trends', getEnrollmentTrends);
router.get('/completion-rates', getCompletionRates);

router.get('/export', exportData);

module.exports = router;
