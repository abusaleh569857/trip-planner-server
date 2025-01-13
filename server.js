require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const bodyParser = require("body-parser");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(bodyParser.json());

const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Token verify করা
    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

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

       
        CASE 
          WHEN trip_route = 'Dhaka-Cox''s Bazar' THEN 2000
          WHEN trip_route = 'Bogura-Cox''s Bazar' THEN 3000
          WHEN trip_route = 'Dhaka-Sylhet' THEN 2500
          WHEN trip_route = 'Chittagong-Sundarbans' THEN 3500
          ELSE 1000 
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

app.get("/admin-dashboard", verifyToken, (req, res) => {
  console.log(req.user.role);
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  res.status(200).json({ message: "Welcome to Admin Dashboard" });
});

app.get("/api/user", verifyToken, async (req, res) => {
  try {
    // Extract the user ID from the JWT payload
    const userId = req.user.id;

    // Query the database for the user based on the extracted user ID
    const query = "SELECT CID, email, role, photoURL FROM users WHERE CID = ?";
    db.query(query, [userId], (err, result) => {
      if (err) {
        console.error("Database error: ", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      const user = result[0]; // Assuming the query returns an array with one user
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        photoURL: user.photoURL,
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get all packages
app.get("/manage-packages", (req, res) => {
  const query = "SELECT * FROM packages";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching packages:", err);
      return res.status(500).json({ error: "Failed to fetch packages." });
    }
    res.json(results);
  });
});

app.post("/register", (req, res) => {
  const {
    first_name,
    last_name,
    phone,
    email,
    password,
    country,
    gender,
    agreed,
  } = req.body;

  // Check if the email already exists in the database
  const checkEmailQuery = "SELECT * FROM users WHERE email = ?";
  db.query(checkEmailQuery, [email], (err, result) => {
    if (err) {
      console.error("Error checking email:", err);
      return res.status(500).json({ message: "Database error" });
    }

    // If email already exists, return an error response
    if (result.length > 0) {
      return res.status(400).json({ message: "Email already in use" });
    }

    // Insert the user data into the database, including the 'agreed' field
    const query =
      "INSERT INTO users (first_name, last_name, phone, email, password, country, gender, agreed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    db.query(
      query,
      [first_name, last_name, phone, email, password, country, gender, agreed],
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
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Please provide both email and password" });
  }

  // Query database for user
  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error("Error querying database:", err);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = results[0];
    console.log(user);

    // Compare plain text passwords
    if (password !== user.password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    console.log(user.CID);

    // Create JWT token
    const token = jwt.sign(
      { id: user.CID, role: user.role, photoURL: user.photoURL }, // Include role for admin panel
      process.env.JWT_SECRET,
      { expiresIn: "1h" } // Token validity
    );

    // Set token in HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: false, // Set to true in production (requires HTTPS)
      // sameSite: "strict",
      // maxAge: 3600000, // 1 hour
    });

    return res.status(200).json({ message: "Login successful" });
  });
});

app.post("/logout", (req, res) => {
  res
    .clearCookie("token", {
      httpOnly: true,
      secure: false,
    })
    .status(200)
    .json({ message: "Logged out successfully" });
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

app.get("/packages/:id", (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT * FROM packages WHERE id = ?
  `;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error fetching package:", err);
      return res.status(500).send("Error fetching package");
    }

    if (result.length === 0) {
      return res.status(404).send("Package not found");
    }

    res.status(200).json(result[0]);
  });
});

app.put("/packages/:id", (req, res) => {
  const { id } = req.params;
  const {
    name,
    startLocation,
    tripPlace,
    price,
    duration,
    hotelType,
    foodIncluded,
    tourGuide,
    transportType,
    startDate,
    endDate,
  } = req.body;

  const sql = `
    UPDATE packages
    SET
      name = ?,
      startLocation = ?,
      tripPlace = ?,
      price = ?,
      duration = ?,
      hotelType = ?,
      foodIncluded = ?,
      tourGuide = ?,
      transportType = ?,
      startDate = ?,
      endDate = ?
    WHERE id = ?
  `;

  // Convert boolean to "Yes"/"No"
  const values = [
    name,
    startLocation,
    tripPlace,
    price,
    duration,
    hotelType,
    foodIncluded ? "Yes" : "No",
    tourGuide ? "Yes" : "No",
    transportType,
    startDate,
    endDate,
    id,
  ];

  // Log the query and values for debugging
  console.log("SQL Query:", sql);
  console.log("Values:", values);

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error updating package:", err);
      return res.status(500).send("Error updating package");
    }

    // Log result to check if update was successful
    console.log("Update result:", result);

    // Check if any row was affected
    if (result.affectedRows === 0) {
      console.error(
        "No rows were updated. Possible issue with the ID or data."
      );
      return res
        .status(400)
        .send("Failed to update package. Please try again.");
    }

    res.status(200).send("Package updated successfully");
  });
});

app.delete("/manage-packages/:id", (req, res) => {
  const { id } = req.params;
  console.log("Id : ", id);

  const query = "DELETE FROM packages WHERE id = ?";
  db.query(query, [parseInt(id)], (err, result) => {
    if (err) {
      console.error("Error deleting package:", err);
      return res.status(500).json({ error: "Failed to delete package." });
    }
    console.log(result);
    if (result.affectedRows === 0) {
      console.log("Package not found with ID:", id);
      return res.status(404).json({ error: "Package not found." });
    }
    res.json({ message: "Package deleted successfully." });
  });
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
