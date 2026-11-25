const blockService = require('./blockService');
const donationService = require('./donationService');
const postService = require('./postService');

function listFeed(user, filter) {
  const { donations, followingCount } = donationService.listDonations(user, filter);
  const posts = postService.listPosts(user, filter);
  const items = blockService.filterVisibleItems(user, [...donations, ...posts]).sort((left, right) =>
    new Date(right.createdAt) - new Date(left.createdAt)
  );
  return { items, followingCount };
}

module.exports = { listFeed };
