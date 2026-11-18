/**
 * Row → API object mappers.
 *
 * The frontend and the Postman collection were written against the original
 * JSON shape (_id, reporter:{...}, camelCase fields), so every query aliases its
 * columns back to that shape here. Nothing in public/js had to change.
 */

const iso = (value) => (value instanceof Date ? value.toISOString() : value || null);

function mapUser(row, { includePrivate = false } = {}) {
  if (!row) return null;
  const user = {
    _id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department || '',
    phone: row.phone || '',
    isActive: row.is_active,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
  if (!includePrivate) delete user.phone;
  return user;
}

function mapReporter(row) {
  if (!row.reporter_id) return null;
  const reporter = { _id: row.reporter_id, name: row.reporter_name };
  if (row.reporter_email !== undefined) reporter.email = row.reporter_email;
  if (row.reporter_department !== undefined) reporter.department = row.reporter_department;
  if (row.reporter_phone !== undefined) reporter.phone = row.reporter_phone;
  return reporter;
}

function mapItem(row, { includePrivate = false } = {}) {
  if (!row) return null;
  const item = {
    _id: row.id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    category: row.category,
    type: row.type,
    location: row.location,
    dateLostOrFound: iso(row.date_lost_or_found),
    imageUrl: row.image_url,
    contactInfo: row.contact_info,
    status: row.status,
    moderationReason: row.moderation_reason,
    moderatedBy: row.moderated_by,
    moderatedAt: iso(row.moderated_at),
    resolvedAt: iso(row.resolved_at),
    reporter: row.reporter_name ? mapReporter(row) : row.reporter,
    views: row.views,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    isOpen: row.status === 'active' || row.status === 'claim_requested',
  };
  if (includePrivate) item.descriptionPrivate = row.description_private || '';
  return item;
}

function mapClaim(row, { includeProof = true } = {}) {
  if (!row) return null;
  const claim = {
    _id: row.id,
    item: row.item_title !== undefined
      ? {
          _id: row.item,
          title: row.item_title,
          category: row.item_category,
          type: row.item_type,
          status: row.item_status,
          location: row.item_location,
          reference: row.item_reference,
          imageUrl: row.item_image_url,
        }
      : row.item,
    claimant: row.claimant_name
      ? {
          _id: row.claimant,
          name: row.claimant_name,
          email: row.claimant_email,
          department: row.claimant_department,
          phone: row.claimant_phone,
        }
      : row.claimant,
    message: row.message,
    status: row.status,
    decisionNote: row.decision_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: iso(row.reviewed_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
  if (includeProof) claim.proof = row.proof;
  return claim;
}

function mapNotification(row) {
  if (!row) return null;
  return {
    _id: row.id,
    user: row.user_id,
    type: row.type,
    message: row.message,
    item: row.item,
    claim: row.claim,
    read: row.read,
    createdAt: iso(row.created_at),
  };
}

function mapAudit(row) {
  if (!row) return null;
  return {
    _id: row.id,
    actor: row.actor,
    actorName: row.actor_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    reason: row.reason,
    metadata: row.metadata,
    ip: row.ip,
    createdAt: iso(row.created_at),
  };
}

module.exports = { mapUser, mapItem, mapClaim, mapNotification, mapAudit, iso };
