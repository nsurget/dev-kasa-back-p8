const express = require('express');
const router = express.Router();

const dbReady = require('../middlewares/dbReady');
const { doRegister, doLogin, doRequestReset, doResetPassword, doVerifyEmail, doResendVerification } = require('../controllers/authController');

// Ensure DB is ready for all auth routes
router.use(dbReady);

// Auth endpoints
router.post('/register', doRegister);
router.post('/login', doLogin);
router.post('/request-reset', doRequestReset);
router.post('/reset-password', doResetPassword);
router.post('/verify-email', doVerifyEmail);
router.post('/resend-verification', doResendVerification);

module.exports = router;
