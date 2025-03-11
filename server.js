const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const app = express();
const port = 3053;

// Middleware
app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: true
}));

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/student1')
    .then(() => console.log("MongoDB connection successful"))
    .catch(err => console.error("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
    role: String,
    regd_no: String,
    name: String,
    dob: String,
    gender: String,
    blood_group: String,
    program: String,
    email: String,
    password: String
});

const Users = mongoose.model("Users", userSchema);

// Attendance Schema
const attendanceSchema = new mongoose.Schema({
    subjectName: String,
    date: String,
    hour: Number,
    attendance: [{
        studentRollNo: String,
        status: String // "Present", "Absent"
    }]
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

// Certificate Schema
const certificateSchema = new mongoose.Schema({
    studentId: String,
    studentName: String,
    certificateName: String,
    certificateDate: String,
    certificateFile: String  // File path stored in MongoDB
});

const Certificate = mongoose.model('Certificate', certificateSchema);

// File Upload Storage Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/');  // Path where the files will be stored
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));  // File naming convention
    }
});

const upload = multer({ storage: storage });

// Serve the registration and login form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

// Register User
app.post('/register', async (req, res) => {
    const { role, regd_no, name, dob, gender, blood_group, program, email, password } = req.body;

    // Check if the user already exists
    const existingUser = await Users.findOne({ email });
    if (existingUser) {
        return res.send("User already exists!");
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = new Users({
        role,
        regd_no,
        name,
        dob,
        gender,
        blood_group,
        program,
        email,
        password: hashedPassword
    });

    await user.save();
    console.log("User Registered:", user);
    res.send("Registration Successful! You can now log in.");
});

// Login User
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Find user in DB
    const user = await Users.findOne({ email });
    if (!user) {
        return res.send("User not found!");
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.send("Invalid credentials!");
    }

    req.session.user = user;

    // Role-based redirection
    if (user.role === 'faculty') {
        return res.redirect('/faculty'); // Redirect to faculty dashboard
    } else if (user.role === 'student') {
        return res.redirect('/student'); // Redirect to student dashboard
    } else {
        return res.send("Invalid role! Please contact administrator.");
    }
});

// Faculty Dashboard
app.get('/faculty', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.redirect('/'); // Redirect to login if not faculty
    }
    res.sendFile(path.join(__dirname, 'faculty.html')); // Load the faculty dashboard
});

// Student Dashboard
app.get('/student', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        return res.redirect('/'); // Redirect to login if not student
    }
    res.sendFile(path.join(__dirname, 'student.html')); // Load the student dashboard
});

const viewCertificates = (req, res) => {
    const { studentId } = req.query;

    let query = {};
    if (studentId) {
        query.studentId = studentId; // Filter by studentId if provided
    }

    Certificate.find(query)
        .populate('studentId')  // Populate student details (if necessary)
        .then(certificates => {
            res.status(200).json(certificates);
        })
        .catch(err => {
            res.status(500).json({ message: 'Failed to fetch certificates', error: err });
        });
};

// Route to view certificates for Student
app.get('/view-certificates', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        return res.redirect('/'); // Redirect to login if not student
    }

    try {
        const certificates = await Certificate.find({ studentId: req.session.user.regd_no });
        res.json(certificates); // Return certificates as JSON response
    } catch (err) {
        res.status(500).send("Error fetching certificates");
    }
});

// Faculty can view students' certificates
app.get('/view-student-certificates/:studentId', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.redirect('/'); // Redirect to login if not faculty
    }

    try {
        const certificates = await Certificate.find({ studentId: req.params.studentId });
        res.json(certificates); // Return certificates for a specific student
    } catch (err) {
        res.status(500).send("Error fetching student certificates");
    }
});



// Route to upload attendance (Faculty)
app.post('/upload-attendance', async (req, res) => {
    const { subjectName, date, hour, students } = req.body;

    // Prepare attendance data
    const attendanceData = students.map(student => ({
        studentRollNo: student.rollNo,
        status: student.status
    }));

    const attendance = new Attendance({
        subjectName,
        date,
        hour,
        attendance: attendanceData
    });

    try {
        await attendance.save();
        res.send("Attendance uploaded successfully!");
    } catch (err) {
        res.status(500).send("Error uploading attendance");
    }
});

// Route to upload marks (Faculty)
app.post('/upload-marks', async (req, res) => {
    const { regd_no, marks } = req.body;

    // Logic to upload marks for students
    res.send("Marks uploaded successfully!");
});

// Route to upload activity certificates
app.post('/upload-certificate', upload.single('certificateFile'), async (req, res) => {
    const { studentId, certificateName, certificateDate } = req.body;

    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    // Save certificate data to MongoDB
    const certificate = new Certificate({
        studentId,
        certificateName,
        certificateDate,
        certificateFile: req.file.path  // Save the path to MongoDB
    });

    try {
        await certificate.save();
        res.send("Certificate uploaded successfully!");
    } catch (err) {
        console.error("Error saving certificate:", err);
        res.status(500).send("Error uploading certificate. Please try again.");
    }
});

// Route to view attendance for a specific subject and date
app.get('/view-attendance/:subjectName/:date', async (req, res) => {
    const { subjectName, date } = req.params;

    try {
        const attendance = await Attendance.findOne({ subjectName, date });

        if (!attendance) {
            return res.status(404).send("Attendance not found");
        }

        res.json(attendance);
    } catch (err) {
        res.status(500).send("Error fetching attendance");
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.send("Logged out successfully!");
    });
});

app.get("/api/students", async (req, res) => {
    try {
        const students = await Student.find({}, "name"); // Fetch only student names
        res.json(students); // Send student names as JSON
    } catch (err) {
        res.status(500).json({ error: "Error fetching students" });
    }
});


app.listen(port, () => {
    console.log(`Server started on port ${port},,,`);
});
