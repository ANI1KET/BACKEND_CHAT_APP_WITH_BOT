const router = require("express").Router();
const userController = require("../controllers/userController");
const { protect } = require("../controllers/authController");

router.post("/generate-zego-token", protect, userController.generateZegoToken);
router.get("/get-call-logs", protect, userController.getCallLogs);
router.get("/get-me", protect, userController.getMe);
router.patch("/update-me", protect, userController.updateMe);
router.get("/get-all-verified-users", protect, userController.getAllVerifiedUsers);
router.get("/get-users", protect, userController.getUsers);
router.get("/get-requests", protect, userController.getRequests);
router.get("/get-friends", protect, userController.getFriends);

router.post("/start-audio-call", protect, userController.startAudioCall);
router.post("/start-video-call", protect, userController.startVideoCall);

module.exports = router;
