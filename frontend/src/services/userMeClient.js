/** Request training progress on /users/me only when the Team page (or similar) needs it. */
export const USER_ME_WITH_TRAINING = { params: { include_training_summary: "true" } };
