require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

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

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.post("/register", (req, res) => {
  const { first_name, last_name, phone, email, password, country, gender } =
    req.body;

  const query =
    "INSERT INTO users (first_name, last_name, phone, email, Password, country, gender) VALUES (?, ?, ?, ?, ?, ?, ?)";
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
