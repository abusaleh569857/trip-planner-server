require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cron = require("node-cron");

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
  console.log("verify token : ", token);
  if (!token) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log(req.user);

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

//Database Connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "travel_website",
});

const promiseDb = db.promise();

db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }
  console.log("Connected to the MySQL database!");
});

// const db = mysql.createConnection({
//   host: "localhost",
//   user: "root",
//   password: "",
//   database: "travel_website",
// });

// // Wrap the connection in a promise-based API
// const promiseDb = db.promise();

// db.connect((err) => {
//   if (err) {
//     console.error("Error connecting to the database:", err);
//     return;
//   }
//   console.log("Connected to the MySQL database!");
// });

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

// Fetch bookings for a specific user
app.get("/get-user-bookings", async (req, res) => {
  const token = req.cookies.token; // Get the token from HTTP-only cookie

  if (!token) {
    return res.status(401).json({ error: "No token found" });
  }

  try {
    // Decode the token to get the CID (User ID)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const CID = decoded.id;

    // Fetch bookings for the specific user (CID)
    const query = `
      SELECT b.booking_id, p.name AS package_name, b.travellers, b.total_cost, b.booking_date,b.status
      FROM bookings b
      JOIN packages p ON b.package_id = p.id
      WHERE b.CID = ?
      ORDER BY b.booking_date DESC
    `;

    db.query(query, [CID], (err, result) => {
      if (err) {
        console.error("Error fetching bookings:", err);
        return res.status(500).send("Error fetching bookings");
      }

      if (result.length === 0) {
        return res.status(404).send("No bookings found for this user");
      }
      console.log(result);

      res.status(200).json({ bookings: result }); // Send the result as JSON
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

app.get("/bookings", (req, res) => {
  // Query to order bookings by status with 'Pending' first
  const query = `
    SELECT * FROM bookings
    ORDER BY 
      CASE 
        WHEN status = 'Pending' THEN 1
        WHEN status = 'Confirmed' THEN 2
        WHEN status = 'Completed' THEN 3
        WHEN status = 'Cancelled' THEN 4
        ELSE 5
      END, booking_date ASC;
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching bookings:", err);
      return res.status(500).json({ error: "Error fetching bookings" });
    }
    console.log(results);
    res.json({ bookings: results });
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
      { expiresIn: "10h" } // Token validity
    );
    console.log("login api : ", token);

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

app.post("/packages", (req, res) => {
  const {
    imageUrl,
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
    description,
    category_id, // Added category_id here
  } = req.body;

  // Debugging: Log incoming request body to check if data is correctly sent from frontend
  console.log("Received package data:", req.body);

  const sql = `
    INSERT INTO packages
      (imageUrl, name, startLocation, tripPlace, price, duration, hotelType, foodIncluded, tourGuide, transportType, startDate, endDate, description, category_id)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Convert boolean values to "Yes"/"No" for foodIncluded and tourGuide
  const values = [
    imageUrl,
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
    description,
    category_id, // Added category_id to the values array
  ];

  // Debugging: Log the SQL query and the values to check before executing
  console.log("SQL Query:", sql);
  console.log("SQL Values:", values);

  // Execute SQL query
  db.query(sql, values, (err, result) => {
    if (err) {
      // Debugging: Log error message from the query execution
      console.error("Error executing query:", err);
      return res.status(500).send("Error adding package");
    }

    // Debugging: Log success message
    console.log("Package added successfully, ID:", result.insertId);
    res.status(201).send("Package added successfully");
  });
});

// Handle booking confirmation
app.post("/book-package", async (req, res) => {
  const { packageId, customPackageId, travellers, finalCost, packageName } =
    req.body;

  const token = req.cookies.token; // Get the token from HTTP-only cookie
  console.log("token: ", token);

  if (!token) {
    return res.status(401).json({ error: "No token found" });
  }

  if (!packageId && !customPackageId) {
    return res
      .status(400)
      .json({ error: "Either packageId or customPackageId is required" });
  }

  console.log("Received data:", {
    packageId,
    customPackageId,
    travellers,
    finalCost,
    packageName,
  });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(decoded);
    const CID = decoded.id;
    console.log("CID:", CID);
    const query = `
      INSERT INTO bookings (
        CID, package_id, custom_package_id, travellers, total_cost, package_name, booking_date
      )
      VALUES (
        ?, 
        CASE WHEN ? IS NOT NULL THEN ? ELSE NULL END, 
        CASE WHEN ? IS NOT NULL THEN ? ELSE NULL END, 
        ?, ?, ?, CURRENT_TIMESTAMP
      );
    `;

    const values = [
      CID,
      packageId,
      packageId,
      customPackageId,
      customPackageId,
      travellers,
      finalCost,
      packageName,
    ];

    db.query(query, values);

    res.status(200).json({ message: "Booking confirmed successfully" });
  } catch (error) {
    console.error("Error booking package:", error);
    res.status(500).json({ error: "Failed to confirm booking" });
  }
});

app.post("/search-packages", async (req, res) => {
  const {
    startDate,
    endDate,
    minPrice,
    maxPrice,
    groupSize,
    duration,
    discountType,
    hotelType,
  } = req.body;

  // Initialize query parts and parameters
  let query = `
    SELECT 
      p.id AS package_id,
      p.name AS package_name,
      p.price,
      p.startLocation,
      p.tripPlace,
      p.duration,
      p.hotelType,
      p.transportType,
      p.imageURL,
      p.description,
      p.tourGuide,
      p.foodIncluded,
      MAX(o.discountType) AS discountType, 
      MAX(o.discountPercentage) AS discountPercentage,
      MAX(o.minDuration) AS minDuration,
      MAX(o.maxDuration) AS maxDuration,
      MAX(o.minGroupSize) AS minGroupSize,
      MAX(o.maxGroupSize) AS maxGroupSize
    FROM 
      packages p
    LEFT JOIN 
      offers o ON p.id = o.package_id
    WHERE 1=1
  `;

  const params = [];

  // Dynamically add filters based on input
  if (startDate) {
    query += " AND p.startDate >= ?";
    params.push(startDate);
  }

  if (endDate) {
    query += " AND p.endDate <= ?";
    params.push(endDate);
  }

  if (minPrice) {
    query += " AND p.price >= ?";
    params.push(minPrice);
  }

  if (maxPrice) {
    query += " AND p.price <= ?";
    params.push(maxPrice);
  }

  if (groupSize) {
    query +=
      " AND (COALESCE(o.minGroupSize, 0) <= ? AND COALESCE(o.maxGroupSize, 0) >= ?)";
    params.push(groupSize, groupSize);
  }

  if (duration) {
    query +=
      " AND (COALESCE(o.minDuration, 0) <= ? AND COALESCE(o.maxDuration, 0) >= ?)";
    params.push(duration, duration);
  }

  if (discountType) {
    query += " AND o.discountType = ?";
    params.push(discountType);
  }

  if (hotelType) {
    query += " AND p.hotelType = ?";
    params.push(hotelType);
  }

  // Add grouping, ordering, and limit
  query += " GROUP BY p.id ORDER BY p.startDate DESC LIMIT 10";

  try {
    db.query(query, params, (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return res
          .status(500)
          .json({ error: "Database query failed", details: err.message });
      }

      if (results.length === 0) {
        console.log("No packages found for the provided filters.");
        return res
          .status(404)
          .json({ message: "No packages found for the provided filters." });
      }

      console.log("Search successful. Found packages:", results);
      res.status(200).json({ packages: results });
    });
  } catch (error) {
    console.error("Unexpected error during package search:", error);
    res
      .status(500)
      .json({ error: "Unexpected server error", details: error.message });
  }
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

app.patch("/bookings/confirm/:bookingId", (req, res) => {
  const { bookingId } = req.params;
  console.log("Booking ID received:", bookingId); // Debugging the booking ID

  if (!bookingId) {
    return res.status(400).json({ error: "Booking ID is required" });
  }

  // Update booking status to 'confirmed' in the database
  db.query(
    "UPDATE bookings SET status = 'Confirmed' WHERE booking_id = ?",
    [bookingId],
    (err, result) => {
      if (err) {
        console.error("Database error:", err); // Log the error
        return res.status(500).json({ error: err.message });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Booking not found" });
      }

      console.log("Booking confirmed:", result); // Log the result of the query
      res.json({ message: "Booking confirmed" });
    }
  );
});

app.patch("/bookings/cancel/:bookingId", (req, res) => {
  const { bookingId } = req.params;

  // Update the booking status to 'Cancelled' in the database
  const query = "UPDATE bookings SET status = 'Cancelled' WHERE booking_id = ?";

  db.query(query, [bookingId], (err, result) => {
    if (err) {
      console.error("Error updating booking status:", err);
      return res.status(500).json({ error: "Failed to cancel booking" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({ message: "Booking status updated to Cancelled" });
  });
});

//Schedule the cron job to run every day at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    const query = `
      UPDATE bookings b
      JOIN packages p ON b.package_id = p.package_id
      SET b.status = 'Completed'
      WHERE p.endDate < CURRENT_DATE AND b.status = 'Confirmed';
    `;
    db.query(query);
    console.log("Booking statuses updated to Completed.");
  } catch (error) {
    console.error("Error updating booking statuses:", error);
  }
});

// Get Completed Packages for Specific User

app.get("/completed-packages", (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "No token found" });
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const CID = decoded.id;
  console.log("CID : ", CID);

  const query = `
    SELECT 
      b.booking_id,
      b.travellers,
      b.total_cost,
      b.status,
      b.booking_date,
      p.id,
      p.name,
      p.startLocation,
      p.tripPlace,
      p.startDate,
      p.endDate
    FROM bookings b
    INNER JOIN packages p ON b.package_id = p.id
    WHERE b.CID = ? AND b.status = 'Completed';
  `;

  db.query(query, [CID], (err, results) => {
    if (err) {
      console.error("Error fetching completed packages:", err);
      return res
        .status(500)
        .json({ error: "Error fetching completed packages" });
    }

    res.json({ completedPackages: results });
  });
});

// Submit a review for a specific package
app.post("/submit-review", (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "No token found" });
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const CID = decoded.id;
  const { booking_id, package_id, reviewText, rating } = req.body;
  console.log(booking_id, package_id, reviewText, rating);

  const query = `
    INSERT INTO reviews (booking_id,user_id,package_id ,review_text,ratings, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
  `;

  db.query(
    query,
    [booking_id, CID, package_id, reviewText, rating],
    (err, result) => {
      if (err) {
        console.error("Error submitting review:", err);
        return res.status(500).json({ error: "Failed to submit review." });
      }

      res.json({ message: "Review submitted successfully." });
    }
  );
});

// Get All Reviews
app.get("/reviews", (req, res) => {
  const sql = `
    SELECT r.review_id, r.review_text, r.ratings, 
           p.name AS package_name, p.startLocation, p.tripPlace, 
           u.first_name AS reviewer_name 
    FROM reviews AS r
    JOIN packages AS p ON r.package_id = p.id
    JOIN users AS u ON r.user_id = u.CID;
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching reviews:", err);
      return res.status(500).json({ error: "Failed to fetch reviews." });
    }
    res.json({ reviews: result });
  });
});

app.get("/admin-stats", async (req, res) => {
  try {
    const [totalUsers] = await promiseDb.query(
      "SELECT COUNT(*) AS count FROM users"
    );
    const [totalPackages] = await promiseDb.query(
      "SELECT COUNT(*) AS count FROM packages"
    );
    const [confirmedPackages] = await promiseDb.query(
      "SELECT COUNT(*) AS count FROM bookings WHERE status = 'Confirmed'"
    );
    const [pendingPackages] = await promiseDb.query(
      "SELECT COUNT(*) AS count FROM bookings WHERE status = 'Pending'"
    );
    const [completedPackages] = await promiseDb.query(
      "SELECT COUNT(*) AS count FROM bookings WHERE status = 'Completed'"
    );

    res.json({
      totalUsers: totalUsers[0]?.count || 0,
      totalPackages: totalPackages[0]?.count || 0,
      confirmedPackages: confirmedPackages[0]?.count || 0,
      pendingPackages: pendingPackages[0]?.count || 0,
      completedPackages: completedPackages[0]?.count || 0,
    });
  } catch (err) {
    console.error("Error fetching admin stats:", err);
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

app.get("/bar-chart-stats", async (req, res) => {
  try {
    const [totalRevenueResult] = await promiseDb.query(
      "SELECT SUM(total_cost) AS totalRevenue FROM bookings WHERE status = 'Completed'"
    );

    const [topDestinationsResult] = await promiseDb.query(
      "SELECT tripPlace, COUNT(tripPlace) AS count FROM packages GROUP BY tripPlace ORDER BY count DESC LIMIT 1"
    );

    const [bookingsLast7DaysResult] = await promiseDb.query(
      "SELECT COUNT(*) AS count FROM bookings WHERE booking_date >= CURDATE() - INTERVAL 7 DAY"
    );

    const [avgPriceResult] = await promiseDb.query(
      "SELECT AVG(total_cost) AS avgPrice FROM bookings"
    );

    const [pendingRevenueResult] = await promiseDb.query(
      "SELECT SUM(total_cost) AS pendingRevenue FROM bookings WHERE status = 'Pending'"
    );

    res.json({
      totalRevenue: totalRevenueResult[0]?.totalRevenue || 0,
      topDestinations: {
        count: topDestinationsResult[0]?.count || 0,
        tripPlace: topDestinationsResult[0]?.tripPlace || "N/A",
      },
      bookingsLast7Days: bookingsLast7DaysResult[0]?.count || 0,
      avgPrice: avgPriceResult[0]?.avgPrice || 0,
      pendingRevenue: pendingRevenueResult[0]?.pendingRevenue || 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bar chart data" });
  }
});

// API to get users and their confirmed packages
// app.get("/admin/manage-users", async (req, res) => {
//   const query = `
//     SELECT
//       u.CID AS user_id,
//       u.first_name,
//       u.last_name,
//       u.email,
//       COUNT(b.booking_id) AS confirmed_packages
//     FROM
//       users u
//     LEFT JOIN
//       bookings b
//     ON
//       u.CID = b.CID AND b.status = 'Confirmed'
//     GROUP BY
//       u.CID, u.first_name, u.last_name, u.email
//     ORDER BY
//       confirmed_packages DESC;
//   `;

//   db.query(query, (err, results) => {
//     if (err) {
//       return res.status(500).json({ error: "Failed to fetch user data" });
//     }
//     res.json(results);
//   });
// });

app.get("/admin/manage-users", async (req, res) => {
  const query = `
    SELECT 
      u.CID AS user_id, 
      u.first_name, 
      u.last_name, 
      u.email, 
      COUNT(CASE WHEN b.status = 'Confirmed' THEN 1 END) AS confirmed_packages,
      COUNT(CASE WHEN b.status = 'Pending' THEN 1 END) AS pending_packages,
      COUNT(CASE WHEN b.status = 'Completed' THEN 1 END) AS completed_packages
    FROM 
      users u
    LEFT JOIN 
      bookings b 
    ON 
      u.CID = b.CID
    GROUP BY 
      u.CID, u.first_name, u.last_name, u.email
    ORDER BY 
      confirmed_packages DESC;
  `;

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch user data" });
    }
    res.json(results);
  });
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
