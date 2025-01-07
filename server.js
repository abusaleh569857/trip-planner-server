require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

// Database Connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "travel_website",
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }
  console.log("Connected to the MySQL database!");
});

// Home Route
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// User Registration
app.post("/register", (req, res) => {
  const { first_name, last_name, phone, email, password, country, gender } =
    req.body;

  const query =
    "INSERT INTO users (first_name, last_name, phone, email, password, country, gender) VALUES (?, ?, ?, ?, ?, ?, ?)";
  db.query(
    query,
    [first_name, last_name, phone, email, password, country, gender],
    (err, result) => {
      if (err) {
        console.error("Error inserting user data:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.status(201).json({
        message: "User registered successfully",
        userId: result.insertId,
      });
    }
  );
});

// User Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Please provide both email and password" });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error("Error querying database:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = results[0];

    if (password === user.password) {
      return res.status(200).json({ message: "Login successful", user });
    } else {
      return res.status(401).json({ message: "Invalid credentials" });
    }
  });
});

// Fetch All Categories
app.get("/categories", (req, res) => {
  const query = "SELECT * FROM categories";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching categories:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.status(200).json(results);
  });
});

// Fetch Packages by Category ID
app.get("/packages/category/:id", (req, res) => {
  const categoryId = req.params.id;
  const query = `
    SELECT p.*, c.name as category_name
    FROM packages p
    JOIN categories c ON p.category_id = c.id
    WHERE p.category_id = ?;
  `;
  db.query(query, [categoryId], (err, results) => {
    if (err) {
      console.error("Error fetching packages:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.status(200).json(results);
  });
});

// custom package cost calculation

app.get("/calculate-price/:id", (req, res) => {
  const customId = req.params.id;

  const sql = `
    SELECT 
      (base_price + 
      (hotel_rate * duration) + 
      (transport_rate * travelers) + 
      (food_rate * travelers * duration) + 
      (tour_guide_rate * duration)) AS total_price
    FROM (
      SELECT 
        CASE 
          WHEN hotel_type = '5-star' THEN 2000 
          ELSE 1000 
        END AS hotel_rate,
        
        CASE 
          WHEN transport_type = 'Flight' THEN 5000 
          WHEN transport_type = 'Train' THEN 2000 
          ELSE 1000 
        END AS transport_rate,
        
        CASE 
          WHEN food_included = 'Yes' THEN 300 
          ELSE 0 
        END AS food_rate,
        
        CASE 
          WHEN tour_guide = 'Yes' THEN 500 
          ELSE 0 
        END AS tour_guide_rate,

        -- Base price calculation based on trip_route
        CASE 
          WHEN trip_route = 'Dhaka-Cox''s Bazar' THEN 2000
          WHEN trip_route = 'Bogura-Cox''s Bazar' THEN 3000
          WHEN trip_route = 'Dhaka-Sylhet' THEN 2500
          WHEN trip_route = 'Chittagong-Sundarbans' THEN 3500
          ELSE 1000 -- Default base price for unknown routes
        END AS base_price,

        duration,
        travelers
      FROM custom_packages
      WHERE custom_id = ?
    ) AS calc;
  `;

  db.query(sql, [customId], (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (result.length === 0) {
      return res.status(404).json({ error: "Package not found" });
    }
    res.json(result[0]); // Return total_price
  });
});

app.post("/api/packages", (req, res) => {
  const {
    trip_route,
    duration,
    hotel_type,
    travelers,
    transport_type,
    food_included,
    tour_guide,
    room_count,
  } = req.body;

  const sql = `
    INSERT INTO custom_packages 
    (trip_route, duration, hotel_type, travelers, transport_type, food_included, tour_guide, room_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      trip_route,
      duration,
      hotel_type,
      travelers,
      transport_type,
      food_included,
      tour_guide,
      room_count,
    ],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // Send custom_id instead of the entire result object
      const customId = result.insertId; // This is the ID of the newly inserted row

      res.status(200).json({
        message: "Package added successfully",
        custom_id: customId, // Use custom_id instead of result.data
      });
    }
  );
});

// POST endpoint to calculate discount and final price
app.post("/calculate-discount", (req, res) => {
  const { packageId, travellers } = req.body;
  console.log("Package Id: ", packageId, "Travellers: ", travellers);

  const sqlQuery = `
    SELECT 
        p.id, 
        p.price, 
        p.duration,
       
        MAX(CASE
            WHEN o.discountType = 'Group Size' AND ? >= o.minGroupSize
            THEN o.discountPercentage
            ELSE 0
        END) AS groupSizeDiscount,

        
        MAX(CASE
            WHEN o.discountType = 'Duration' AND p.duration >= o.minDuration
            THEN o.discountPercentage
            ELSE 0
        END) AS durationDiscount

    FROM packages p
    LEFT JOIN offers o ON p.id = o.package_id
    WHERE p.id = ?
    GROUP BY p.id, p.price, p.duration;
  `;

  // Query Execution
  db.query(sqlQuery, [travellers, packageId], (err, results) => {
    if (err) {
      console.error("Error in query execution: ", err);
      return res.status(500).send("Database error while fetching data");
    }

    if (results.length === 0) {
      console.log("No results found for packageId: ", packageId);
      return res.status(404).send("Package not found or no offers available");
    }

    const package = results[0];
    console.log("Package Data: ", package);

    // Base cost calculation
    const baseCost = parseFloat(package.price) * travellers;
    console.log("Base Cost: ", baseCost);

    // Discount calculations
    const durationDiscount = parseFloat(package.durationDiscount) || 0;
    const groupSizeDiscount = parseFloat(package.groupSizeDiscount) || 0;

    console.log("Duration Discount: ", durationDiscount);
    console.log("Group Size Discount: ", groupSizeDiscount);

    // Total discount percentage
    const totalDiscount = durationDiscount + groupSizeDiscount;
    console.log("Total Discount: ", totalDiscount);

    // Discount amount and final price calculation
    const discountAmount = (baseCost * totalDiscount) / 100;
    console.log("Discount Amount: ", discountAmount);

    const finalPrice = baseCost - discountAmount;
    console.log("Final Price: ", finalPrice);

    // Response
    res.json({
      baseCost,
      totalDiscount,
      discountAmount,
      finalPrice,
    });
  });
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
