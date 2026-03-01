import { Group } from "../models/group.model.js";
import { User } from "../models/user.model.js";
import { History } from "../models/history.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const createGroup = async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) {
      throw new ApiError(400, "Group name is required");
    }

    const group = await Group.create({
      name,
      createdBy: req.user._id,
      members: [req.user._id],
    });

    const populatedGroup = await Group.findById(group._id)
      .populate("members", "name username pubKey")
      .populate("createdBy", "name username");

    await History.create({
      user: req.user._id,
      actionType: "GROUP_CREATED",
      group: group._id,
      description: `You created group "${name}"`,
    });

    return res
      .status(201)
      .json(new ApiResponse(201, populatedGroup, "Group created successfully"));
  } catch (error) {
    next(error);
  }
};

export const getUserGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ members: req.user._id })
      .populate("members", "name username pubKey")
      .populate("createdBy", "name username")
      .sort({ updatedAt: -1 });

    return res
      .status(200)
      .json(new ApiResponse(200, groups, "Groups fetched successfully"));
  } catch (error) {
    next(error);
  }
};

export const getGroupById = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate("members", "name username pubKey")
      .populate("createdBy", "name username");

    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    const isMember = group.members.some(
      (member) => member._id.toString() === req.user._id.toString(),
    );
    if (!isMember) {
      throw new ApiError(403, "You are not a member of this group");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, group, "Group fetched successfully"));
  } catch (error) {
    next(error);
  }
};

export const addMember = async (req, res, next) => {
  try {
    const { username } = req.body;
    const { groupId } = req.params;

    if (!username) {
      throw new ApiError(400, "Username is required");
    }

    const group = await Group.findById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Only group creator can add members
    if (group.createdBy.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "Only the group creator can add members");
    }

    const userToAdd = await User.findOne({
      username: username.toLowerCase(),
    });
    if (!userToAdd) {
      throw new ApiError(404, "User not found");
    }

    // Check if already a member
    if (group.members.includes(userToAdd._id)) {
      throw new ApiError(400, "User is already a member of this group");
    }

    group.members.push(userToAdd._id);
    await group.save();

    const updatedGroup = await Group.findById(groupId)
      .populate("members", "name username pubKey")
      .populate("createdBy", "name username");

    await History.create({
      user: req.user._id,
      actionType: "MEMBER_ADDED",
      group: groupId,
      description: `You added ${userToAdd.name} to "${group.name}"`,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, updatedGroup, "Member added successfully"));
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    const { groupId, userId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    if (group.createdBy.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "Only the group creator can remove members");
    }

    if (userId === group.createdBy.toString()) {
      throw new ApiError(400, "Cannot remove the group creator");
    }

    group.members = group.members.filter(
      (member) => member.toString() !== userId,
    );
    await group.save();

    const updatedGroup = await Group.findById(groupId)
      .populate("members", "name username pubKey")
      .populate("createdBy", "name username");

    // We can look up the user to get their name for a better history message
    const removedUser = await User.findById(userId);
    const removedUserName = removedUser ? removedUser.name : "a member";

    await History.create({
      user: req.user._id,
      actionType: "MEMBER_REMOVED",
      group: groupId,
      description: `You removed ${removedUserName} from "${group.name}"`,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, updatedGroup, "Member removed successfully"));
  } catch (error) {
    next(error);
  }
};
