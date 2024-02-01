const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const sendEmail = require("../services/mailer");
const crypto = require("crypto");

const filterObj = require("../utils/filterObj");
const User = require("../models/user");
const otp = require("../Templates/Mail/otp");
const resetPassword = require("../Templates/Mail/resetPassword");
const { promisify } = require("util");
const catchAsync = require("../utils/catchAsync");
const { randomFill } = require("crypto");

// this function will return you jwt token
const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);

// Register New User
exports.register = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  const filteredBody = filterObj(
    req.body,
    "firstName",
    "lastName",
    "email",
    "password"
  );

  const existing_user = await User.findOne({ email: email });

  if (existing_user && existing_user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email already in use, Please login.",
    });
  } else if (existing_user) {
    // await User.findOneAndUpdate({ email: email }, filteredBody, {
    //   new: true,
    //   validateModifiedOnly: true,
    // });

    existing_user.firstName = req.body.firstName;
    existing_user.lastName = req.body.lastName;
    // existing_user.email = req.body.email;
    // existing_user.password = req.body.password;

    await existing_user.save({ new: true, validateModifiedOnly: true });

    req.userId = existing_user._id;
    next();
  } else {
    const new_user = await User.create(filteredBody);

    req.userId = new_user._id;
    next();
  }
});

exports.sendOTP = catchAsync(async (req, res, next) => {
  const { userId } = req;
  const new_otp = otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    specialChars: false,
    lowerCaseAlphabets: false,
  });

  const otp_expiry_time = Date.now() + 10 * 60 * 1000; // 10 Mins

  const user = await User.findByIdAndUpdate(userId, {
    otp_expiry_time: otp_expiry_time,
  });

  user.otp = new_otp.toString();

  await user.save({ new: true, validateModifiedOnly: true });

  // mailService.sendEmail({
  //   from: "afnosaman24.7@gmail.com",
  //   to: user.email,
  //   subject: "Verification OTP",
  //   html: otp(user.firstName, new_otp),
  //   attachments: [],
  //   // text: `Your OTP is ${new_otp}. This is valid for 10mins.`
  // });

  await sendEmail({
    email: user.email,
    subject: `Verification OTP`,
    // message,
    html: otp(user.firstName, new_otp),
  });

  res.status(200).json({
    status: "success",
    message: "OTP Sent Successfully!",
  });
});


exports.verifyOTP = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;
  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Email is invalid or OTP expired",
    });
  }

  if (user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already verified",
    });
  }

  if (!(await user.correctOTP(otp, user.otp))) {
    return res.status(400).json({
      status: "error",
      message: "OTP is incorrect",
    });
  }

  user.verified = true;
  user.otp = undefined;
  await user.save({ new: true, validateModifiedOnly: true });

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "OTP verified Successfully!",
    token,
    user_id: user._id,
  });
});


// User Login
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      status: "error",
      message: "Both email and password are required",
    });
    return;
  }
  const user = await User.findOne({ email: email }).select("+password");

  if (!user || !user.password) {
    return res.status(400).json({
      status: "error",
      message: "User doesn't exist, Please register to access the resources.",
    });
  }
  if (!(await user.correctPassword(password, user.password))) {
    return res.status(400).json({
      status: "error",
      message: "Email or password is incorrect",
    });
  }

  const token = signToken(user._id);

  return res.status(200).json({
    status: "success",
    message: "Logged in successfully!",
    token,
    user_id: user._id,
  });
});


// Protect
exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return res.status(401).json({
      message: "Please log in to get access.",
    });
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  const this_user = await User.findById(decoded.userId);
  if (!this_user) {
    return res.status(401).json({
      message: "The user does not exists.",
    });
  }

  if (this_user.changedPasswordAfter(decoded.iat)) {
    return res.status(401).json({
      message: "User recently changed password! Please log in again.",
    });
  }

  req.user = this_user;
  next();
});


exports.forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "There is no user with email address.",
    });
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    const resetURL = `${process.env.FRONTEND_URL}/auth/new-password?token=${resetToken}`;
    // await mailService.sendEmail({
    //   to: user.email,
    //   from: "afnosaman24.7@gmail.com",
    //   subject: "Reset Password",
    //   html: resetPassword(user.firstName, resetURL),
    //   attachments: [],
    // });

    const a = await sendEmail({
      email: user.email,
      subject: `Reset Password`,
      html: resetPassword(user.firstName, resetURL),
    });

    return res.status(200).json({
      status: "success",
      message: "Token sent to email!",
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return res.status(500).json({
      message: "There was an error sending the email. Try again later!",
    });
  }
});


exports.resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.body.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Token is Invalid or Expired",
    });
  }

  if (req.body.password !== req.body.passwordConfirm) {
    return res.status(400).json({
      status: "error",
      message: "Password does not match",
    });
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "Password Reseted Successfully",
    token,
  });
});
