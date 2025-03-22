const mongoose = require('mongoose');
const { centralDB } = require('../config/database');
const Service = require('../models/Service');
const ServiceProviderSchema = require('../models/ServiceProvider');
const multer = require('multer');
const AWS = require('aws-sdk');

const ServiceProvider = centralDB.model('ServiceProvider', ServiceProviderSchema);

// Configure multer to store files in memory (we'll upload to Spaces directly)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5000000 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    }
    cb('Error: Images only (jpeg, jpg, png)!');
  }
}).array('images', 5); // Allow up to 5 images

// Configure DigitalOcean Spaces
const spacesEndpoint = new AWS.Endpoint('nyc3.digitaloceanspaces.com'); // Change region if needed
const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: process.env.DO_SPACES_KEY, // Store in environment variables
  secretAccessKey: process.env.DO_SPACES_SECRET // Store in environment variables
});

// Create a new service
exports.createService = async (req, res) => {
  try {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err });
      }

      const { title, description, location, availableHours } = req.body;
      const serviceProviderId = req.user.id;

      const serviceProvider = await ServiceProvider.findById(serviceProviderId);
      if (!serviceProvider) {
        return res.status(404).json({ message: 'Service provider not found' });
      }

      // Upload images to DigitalOcean Spaces
      const imageUrls = await Promise.all(
        req.files.map(async (file) => {
          const params = {
            Bucket: process.env.DO_SPACES_BUCKET, // e.g., 'my-app-bucket'
            Key: `services/${Date.now()}-${file.originalname}`,
            Body: file.buffer,
            ACL: 'public-read', // Make images publicly accessible
            ContentType: file.mimetype
          };
          const { Location } = await s3.upload(params).promise();
          return Location;
        })
      );

      const service = new Service({
        title,
        description,
        images: imageUrls,
        location: {
          type: 'Point',
          coordinates: JSON.parse(location.coordinates),
          address: location.address || 'Unknown Location',
        },
        availableHours,
        serviceProvider: serviceProviderId,
        serviceProviderName: serviceProvider.name,
      });

      await service.save();
      res.status(201).json({ 
        message: 'Service created successfully',
        images: imageUrls 
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get service(s)
exports.getService = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    const { id } = req.params;

    if (id) {
      const service = await Service.findById(id).populate('reviews.userId');
      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }
      return res.json(service);
    }

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    const userLocation = {
      type: 'Point',
      coordinates: [parseFloat(longitude), parseFloat(latitude)],
    };

    const services = await Service.find({
      location: {
        $near: {
          $geometry: userLocation,
          $maxDistance: 10000, // 10km
        },
      },
    }).populate('reviews.userId');

    res.json(services);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Edit a service
exports.editService = async (req, res) => {
  try {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err });
      }

      const { id } = req.params;
      const { title, description, location, availableHours } = req.body;
      const serviceProviderId = req.user.id;

      const service = await Service.findById(id);
      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }

      if (service.serviceProvider.toString() !== serviceProviderId) {
        return res.status(403).json({ message: 'You are not authorized' });
      }

      service.title = title || service.title;
      service.description = description || service.description;
      if (location) {
        service.location = {
          type: 'Point',
          coordinates: JSON.parse(location.coordinates),
          address: location.address || service.location.address,
        };
      }
      service.availableHours = availableHours || service.availableHours;

      if (req.files && req.files.length > 0) {
        const imageUrls = await Promise.all(
          req.files.map(async (file) => {
            const params = {
              Bucket: process.env.DO_SPACES_BUCKET,
              Key: `services/${Date.now()}-${file.originalname}`,
              Body: file.buffer,
              ACL: 'public-read',
              ContentType: file.mimetype
            };
            const { Location } = await s3.upload(params).promise();
            return Location;
          })
        );
        service.images = imageUrls; // Replace existing images
        // Optional: Uncomment to append instead of replace
        // service.images = [...service.images, ...imageUrls];
      }

      await service.save();
      res.json({ message: 'Service updated successfully', service });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Delete a service
exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceProviderId = req.user.id;

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    if (service.serviceProvider.toString() !== serviceProviderId) {
      return res.status(403).json({ message: 'You are not authorized' });
    }

    // Optional: Delete images from DigitalOcean Spaces
    if (service.images && service.images.length > 0) {
      await Promise.all(
        service.images.map(async (imageUrl) => {
          const key = imageUrl.split('/').slice(-1)[0]; // Extract filename from URL
          const params = {
            Bucket: process.env.DO_SPACES_BUCKET,
            Key: `services/${key}`
          };
          try {
            await s3.deleteObject(params).promise();
          } catch (err) {
            console.error(`Failed to delete image ${key}:`, err);
          }
        })
      );
    }

    await service.deleteOne();
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Add a review to a service
exports.addReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment, role } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid service ID' });
    }

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    const reviewRole = role
      ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
      : req.user.role;
    const reviewName = req.user.name || 'Unknown';

    const review = {
      userId: req.user.id,
      userModel: reviewRole,
      name: reviewName,
      rating,
      comment,
      date: new Date(),
    };

    service.reviews.push(review);
    await service.save();
    res.status(201).json({ message: 'Review added successfully' });
  } catch (error) {
    console.error('AddReview Error:', error.stack);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
