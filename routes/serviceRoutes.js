const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const serviceController = require('../controllers/serviceController');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '') || req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = decoded; // { id, role }
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Authenticated routes
router.post('/', authMiddleware, serviceController.createService);
router.get('/', authMiddleware, serviceController.getService);
router.put('/:id', authMiddleware, serviceController.editService);
router.delete('/:id', authMiddleware, serviceController.deleteService);
router.get('/:id', authMiddleware, serviceController.getService); // Now authenticated
router.post('/:id/reviews', authMiddleware, serviceController.addReview); // Now authenticated

module.exports = router;