/** One source of truth for the controlled vocabularies used by validation and the forms. */
const CATEGORIES = [
  'Electronics',
  'Books & Notes',
  'ID Card',
  'Wallet & Cards',
  'Keys',
  'Clothing',
  'Accessories',
  'Sports Equipment',
  'Bags',
  'Other',
];

const LOCATIONS = [
  'Main Library',
  'Block A - Academic',
  'Block B - Academic',
  'Computer Lab 1',
  'Computer Lab 2',
  'Cafeteria',
  'Auditorium',
  'Sports Complex',
  'Hostel Block',
  'Parking Area',
  'Bus Stop',
  'Other',
];

const STATUSES = ['pending', 'active', 'claim_requested', 'resolved', 'rejected', 'expired'];

module.exports = { CATEGORIES, LOCATIONS, STATUSES };
