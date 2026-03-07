import { User } from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ENV } from "../config/env.js";
const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    console.error("[generateAccessAndRefreshToken Error]: ", error);
    throw new ApiError(
      500,
      `Something went wrong while generating access and refresh token: ${error.message}`,
    );
  }
};
const cookieOptions = {
  httpOnly: true,
  secure: true,
};
export const registerUser = async (req, res, next) => {
  try {
    const { name, username, email, password, pubKey } = req.body;
    if (!name || !username || !email || !password || !pubKey) {
      throw new ApiError(400, "All fields are required");
    }
    const query = [];
    if (email) query.push({ email });
    if (username) query.push({ username });
    if (pubKey) query.push({ pubKey });
    const existingUser = await User.findOne({ $or: query });
    if (existingUser) {
      throw new ApiError(
        400,
        "User with this email, username, or pubKey already exists",
      );
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await User.create({
      name,
      username: username.toLowerCase(),
      email,
      password: hashedPassword,
      pubKey,
    });
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id,
    );
    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken",
    );
    return res
      .status(201)
      .cookie("accessToken", accessToken, cookieOptions)
      .cookie("refreshToken", refreshToken, cookieOptions)
      .json(
        new ApiResponse(
          201,
          { user: createdUser, accessToken, refreshToken },
          "User registered successfully",
        ),
      );
  } catch (error) {
    next(error);
  }
};
export const loginUser = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    if (!(username || email)) {
      throw new ApiError(400, "Username or email is required");
    }
    if (!password) {
      throw new ApiError(400, "Password is required");
    }
    const query = [];
    if (email) query.push({ email });
    if (username) query.push({ username });
    const user = await User.findOne({ $or: query });
    if (!user) {
      throw new ApiError(400, "Invalid Credentials");
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new ApiError(400, "Invalid Credentials");
    }
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id,
    );
    const loggedInUser = await User.findById(user._id).select(
      "-password -refreshToken",
    );
    return res
      .status(200)
      .cookie("accessToken", accessToken, cookieOptions)
      .cookie("refreshToken", refreshToken, cookieOptions)
      .json(
        new ApiResponse(
          200,
          { user: loggedInUser, accessToken, refreshToken },
          "User logged in successfully",
        ),
      );
  } catch (error) {
    next(error);
  }
};
export const logoutUser = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(
      req.user._id,
      { $unset: { refreshToken: 1 } },
      { new: true },
    );
    return res
      .status(200)
      .clearCookie("accessToken", cookieOptions)
      .clearCookie("refreshToken", cookieOptions)
      .json(new ApiResponse(200, {}, "User logged out"));
  } catch (error) {
    next(error);
  }
};
export const refreshAccessToken = async (req, res, next) => {
  try {
    const incomingRefreshToken =
      req.cookies?.refreshToken || req.body?.refreshToken;
    if (!incomingRefreshToken) {
      throw new ApiError(401, "Unauthorized request");
    }
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      ENV.REFRESH_TOKEN_SECRET,
    );
    const user = await User.findById(decodedToken?.userId);
    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id,
    );
    return res
      .status(200)
      .cookie("accessToken", accessToken, cookieOptions)
      .cookie("refreshToken", refreshToken, cookieOptions)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken },
          "Access token refreshed",
        ),
      );
  } catch (error) {
    next(error);
  }
};
export const getCurrentUser = async (req, res, next) => {
  try {
    return res
      .status(200)
      .json(new ApiResponse(200, req.user, "User fetched successfully"));
  } catch (error) {
    next(error);
  }
};
export const updatePubKey = async (req, res, next) => {
  try {
    const { pubKey } = req.body;
    if (!pubKey) throw new ApiError(400, "pubKey is required");
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { pubKey },
      { new: true },
    ).select("-password -refreshToken");
    return res
      .status(200)
      .json(new ApiResponse(200, user, "Public key updated successfully"));
  } catch (error) {
    next(error);
  }
};
export const updatePushToken = async (req, res, next) => {
  try {
    const { expoPushToken } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { expoPushToken },
      { new: true },
    ).select("-password -refreshToken");
    return res
      .status(200)
      .json(new ApiResponse(200, user, "Push token updated successfully"));
  } catch (error) {
    next(error);
  }
};
