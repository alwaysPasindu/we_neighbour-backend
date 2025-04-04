require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB, centralDB } = require('./config/database');
const { db } = require('./config/firebase');
//const admin = require('firebase-admin'); // Add Firebase Admin

const app = express();
const PORT = process.env.PORT || 3000;


centralDB.on('error', (err) => {
  console.error('Central database connection error:', err);
});

centralDB.once('open', () => {
  console.log('Connected to central database');
});

// Initialize the default database connection (if needed)
connectDB()
  .then(() => {
    console.log('Default database connected successfully');
  })
  .catch((err) => {
    console.error('Default database connection failed:', err);
  });

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Backend is running');
});

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const residentRoutes = require('./routes/residentRoutes');
app.use('/api/residents', residentRoutes);

const managerRoutes = require('./routes/managerRoutes');
app.use('/api/managers', managerRoutes);

const serviceProviderRoutes = require('./routes/serviceProviderRoutes');
app.use('/api/service-providers', serviceProviderRoutes);

const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

const safetyAlertsRoutes = require('./routes/safetyRoutes');
app.use('/api/safety-alerts', safetyAlertsRoutes);

const complaintsRoutes = require('./routes/complaintRoutes');
app.use('/api/complaints', complaintsRoutes);

const visitorRoutes = require('./routes/visitorRoutes');
app.use('/api/visitor', visitorRoutes);

const maintenanceRoutes = require('./routes/maintenanceRoutes');
app.use('/api/maintenance', maintenanceRoutes);

const serviceRoutes = require('./routes/serviceRoutes');
app.use('/api/service', serviceRoutes);

const healthRoutes = require('./routes/healthRoutes');
app.use('/api', healthRoutes);

const resourceRoutes = require('./routes/resourceRoutes');
app.use('/api/resource', resourceRoutes);

const apartmentRoutes = require('./routes/apartmentsRoutes');
app.use('/api/apartments', apartmentRoutes);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
