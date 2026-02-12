import mongoose from "mongoose";

const prayerRequestSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    default: "Anonymous",
  },
  request: {
    type: String,
    required: true,
  },
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ["pending", "in-progress", "answered", "archived"],
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const PrayerRequest = mongoose.model("PrayerRequest", prayerRequestSchema);

export default PrayerRequest;
