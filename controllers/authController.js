const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { connectDB, centralDB } = require('../config/database');
const ResidentSchema = require('../models/Resident');
const ManagerSchema = require('../models/Manager');
const ServiceSchema = require('../models/ServiceProvider');
const ApartmentSchema = require('../models/Apartment');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    let user;
    let userType;

    const ServiceProvider = centralDB.model('ServiceProvider', ServiceSchema);
    user = await ServiceProvider.findOne({ email });
    if (user) {
      userType = 'ServiceProvider';
    }

    if (!user) {
      const Apartment = centralDB.model('Apartment', ApartmentSchema);
      const apartments = await Apartment.find({}, 'apartmentName');

      for (const apartment of apartments) {
        const db = await connectDB(apartment.apartmentName);
        console.log(`Connected to database: ${apartment.apartmentName}`);
        const Resident = db.model('Resident', ResidentSchema);
        const Manager = db.model('Manager', ManagerSchema);

        user = await Resident.findOne({ email });
        if (user) {
          userType = 'Resident';
          user.apartmentComplexName = apartment.apartmentName;
          break;
        }

        user = await Manager.findOne({ email });
        if (user) {
          userType = 'Manager';
          user.apartmentComplexName = apartment.apartmentName;
          break;
        }
      }
    }

    if (!user) {
      return res.status(400).json({ message: 'Your Email or Password is incorrect' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Your Email or Password is incorrect' });
    }

    const payload = {
      id: user._id,
      role: userType,
      name: user.name, // Added name to token
      apartmentComplexName: user.apartmentComplexName || null,
      status: user.status || null,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    if (userType === 'Resident' && user.status !== 'approved') {
      return res.status(403).json({
        message: 'Your registration request is pending or rejected',
        token: token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          apartmentComplexName: user.apartmentComplexName || null,
          role: userType,
          status: user.status,
        },
      });
    }

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        apartmentComplexName: user.apartmentComplexName || null,
        role: userType,
        status: user.status || null,
      },
    });
  } catch (error) {
    console.error('Error in login:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};