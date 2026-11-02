PRAGMA foreign_keys = ON;

CREATE TABLE schema_meta (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT INTO schema_meta VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name_en TEXT NOT NULL CHECK(length(name_en) BETWEEN 2 AND 70),
  name_ar TEXT NOT NULL CHECK(length(name_ar) BETWEEN 2 AND 70),
  role TEXT NOT NULL CHECK(role IN ('admin','doctor','student')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','inactive')),
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK(auth_version > 0),
  record_version INTEGER NOT NULL DEFAULT 1 CHECK(record_version > 0),
  color TEXT NOT NULL DEFAULT '#155f53',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX users_one_admin ON users(role) WHERE role='admin';
CREATE TRIGGER protect_admin_update BEFORE UPDATE OF role,status ON users
WHEN OLD.role='admin' AND (NEW.role!='admin' OR NEW.status='inactive')
BEGIN SELECT RAISE(ABORT,'sole_admin_protected'); END;
CREATE TRIGGER protect_admin_delete BEFORE DELETE ON users WHEN OLD.role='admin'
BEGIN SELECT RAISE(ABORT,'sole_admin_protected'); END;

CREATE TABLE programs (
  id TEXT PRIMARY KEY, name_en TEXT NOT NULL, name_ar TEXT NOT NULL,
  description_en TEXT NOT NULL DEFAULT '', description_ar TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL, current_template_id TEXT REFERENCES template_versions(id),
  created_at TEXT NOT NULL
);
CREATE TABLE template_versions (
  id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES programs(id),
  version INTEGER NOT NULL CHECK(version>0), created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL, UNIQUE(program_id,version)
);
CREATE TABLE template_questions (
  template_version_id TEXT NOT NULL REFERENCES template_versions(id),
  question_key TEXT NOT NULL, position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 19),
  label_en TEXT NOT NULL CHECK(length(trim(label_en)) BETWEEN 1 AND 90),
  label_ar TEXT NOT NULL CHECK(length(trim(label_ar)) BETWEEN 1 AND 90),
  PRIMARY KEY(template_version_id,question_key), UNIQUE(template_version_id,position),
  UNIQUE(template_version_id,label_en), UNIQUE(template_version_id,label_ar)
);
CREATE TRIGGER immutable_template_version_update BEFORE UPDATE ON template_versions BEGIN SELECT RAISE(ABORT,'immutable_template'); END;
CREATE TRIGGER immutable_template_version_delete BEFORE DELETE ON template_versions BEGIN SELECT RAISE(ABORT,'immutable_template'); END;
CREATE TRIGGER immutable_template_question_update BEFORE UPDATE ON template_questions BEGIN SELECT RAISE(ABORT,'immutable_template'); END;
CREATE TRIGGER immutable_template_question_delete BEFORE DELETE ON template_questions BEGIN SELECT RAISE(ABORT,'immutable_template'); END;
CREATE TRIGGER sealed_template_question_insert BEFORE INSERT ON template_questions
WHEN (EXISTS(SELECT 1 FROM programs WHERE current_template_id=NEW.template_version_id)
 OR EXISTS(SELECT 1 FROM evaluations WHERE template_version_id=NEW.template_version_id))
 AND NOT EXISTS(SELECT 1 FROM template_questions WHERE template_version_id=NEW.template_version_id AND question_key=NEW.question_key AND position=NEW.position AND label_en=NEW.label_en AND label_ar=NEW.label_ar)
BEGIN SELECT RAISE(ABORT,'immutable_template'); END;
CREATE TRIGGER validate_program_template BEFORE UPDATE OF current_template_id ON programs
WHEN NEW.current_template_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM template_versions WHERE id=NEW.current_template_id AND program_id=NEW.id) OR (SELECT count(*) FROM template_questions WHERE template_version_id=NEW.current_template_id) NOT BETWEEN 1 AND 20)
BEGIN SELECT RAISE(ABORT,'invalid_template'); END;

CREATE TABLE doctor_programs (
  doctor_id TEXT NOT NULL REFERENCES users(id), program_id TEXT NOT NULL REFERENCES programs(id),
  PRIMARY KEY(doctor_id,program_id)
);
CREATE TABLE resident_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id), program_id TEXT NOT NULL REFERENCES programs(id),
  training_year INTEGER NOT NULL CHECK(training_year BETWEEN 1 AND 6), joined_at TEXT NOT NULL
);
CREATE TABLE assignments (
  id TEXT PRIMARY KEY, resident_id TEXT NOT NULL REFERENCES resident_profiles(user_id),
  doctor_id TEXT NOT NULL REFERENCES users(id), started_at TEXT NOT NULL,
  ended_at TEXT, created_by TEXT NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX assignments_one_current ON assignments(resident_id) WHERE ended_at IS NULL;
CREATE INDEX assignments_doctor_current ON assignments(doctor_id,ended_at,resident_id);
CREATE TRIGGER validate_doctor_program_insert BEFORE INSERT ON doctor_programs WHEN (SELECT role FROM users WHERE id=NEW.doctor_id)!='doctor' BEGIN SELECT RAISE(ABORT,'invalid_doctor_role'); END;
CREATE TRIGGER validate_doctor_program_update BEFORE UPDATE ON doctor_programs WHEN (SELECT role FROM users WHERE id=NEW.doctor_id)!='doctor' BEGIN SELECT RAISE(ABORT,'invalid_doctor_role'); END;
CREATE TRIGGER validate_resident_role_insert BEFORE INSERT ON resident_profiles WHEN (SELECT role FROM users WHERE id=NEW.user_id)!='student' BEGIN SELECT RAISE(ABORT,'invalid_resident_role'); END;
CREATE TRIGGER validate_resident_role_update BEFORE UPDATE ON resident_profiles WHEN (SELECT role FROM users WHERE id=NEW.user_id)!='student' BEGIN SELECT RAISE(ABORT,'invalid_resident_role'); END;
CREATE TRIGGER validate_assignment_insert BEFORE INSERT ON assignments WHEN (SELECT role FROM users WHERE id=NEW.doctor_id)!='doctor' BEGIN SELECT RAISE(ABORT,'invalid_doctor_role'); END;
CREATE TRIGGER validate_assignment_update BEFORE UPDATE ON assignments WHEN (SELECT role FROM users WHERE id=NEW.doctor_id)!='doctor' BEGIN SELECT RAISE(ABORT,'invalid_doctor_role'); END;

CREATE TABLE invitations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
  program_id TEXT REFERENCES programs(id), status TEXT NOT NULL CHECK(status IN ('pending','accepted','revoked')),
  created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  accepted_at TEXT, revoked_at TEXT
);
CREATE UNIQUE INDEX invitations_one_pending ON invitations(user_id) WHERE status='pending';
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), auth_version INTEGER NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
);
CREATE INDEX login_tokens_user ON login_tokens(user_id,expires_at);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id),
  auth_version INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL, revoked_at TEXT
);
CREATE INDEX sessions_user ON sessions(user_id,revoked_at);

CREATE TABLE evaluations (
  id TEXT PRIMARY KEY, resident_id TEXT NOT NULL REFERENCES resident_profiles(user_id),
  doctor_id TEXT NOT NULL REFERENCES users(id), program_id TEXT NOT NULL REFERENCES programs(id),
  training_year INTEGER NOT NULL CHECK(training_year BETWEEN 1 AND 6),
  period TEXT NOT NULL CHECK(length(period)=7 AND substr(period,5,1)='-'),
  template_version_id TEXT NOT NULL REFERENCES template_versions(id),
  status TEXT NOT NULL CHECK(status IN ('draft','published')),
  version INTEGER NOT NULL CHECK(version>0),
  base_published_id TEXT REFERENCES evaluations(id),
  overall_score REAL CHECK(overall_score IS NULL OR overall_score BETWEEN 1 AND 10),
  created_at TEXT NOT NULL, published_at TEXT,
  CHECK(status='draft' OR (overall_score IS NOT NULL AND published_at IS NOT NULL))
);
CREATE UNIQUE INDEX evaluations_one_own_draft ON evaluations(resident_id,doctor_id,period) WHERE status='draft';
CREATE INDEX evaluations_resident_period ON evaluations(resident_id,period,status);
CREATE TABLE evaluation_heads (
  resident_id TEXT NOT NULL REFERENCES resident_profiles(user_id), period TEXT NOT NULL,
  published_id TEXT NOT NULL REFERENCES evaluations(id), PRIMARY KEY(resident_id,period)
);
CREATE TABLE evaluation_questions (
  evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL, position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 19),
  label_en TEXT NOT NULL, label_ar TEXT NOT NULL,
  score INTEGER CHECK(score IS NULL OR (typeof(score)='integer' AND score BETWEEN 1 AND 10)),
  PRIMARY KEY(evaluation_id,position), UNIQUE(evaluation_id,question_key)
);
CREATE TABLE evaluation_notes (
  evaluation_id TEXT PRIMARY KEY REFERENCES evaluations(id) ON DELETE CASCADE,
  note_en TEXT NOT NULL DEFAULT '' CHECK(length(note_en)<=3000),
  note_ar TEXT NOT NULL DEFAULT '' CHECK(length(note_ar)<=3000)
);
CREATE TRIGGER immutable_published_update BEFORE UPDATE ON evaluations WHEN OLD.status='published'
BEGIN SELECT RAISE(ABORT,'immutable_published_evaluation'); END;
CREATE TRIGGER immutable_published_delete BEFORE DELETE ON evaluations WHEN OLD.status='published'
BEGIN SELECT RAISE(ABORT,'immutable_published_evaluation'); END;
CREATE TRIGGER published_must_transition BEFORE INSERT ON evaluations WHEN NEW.status='published'
BEGIN SELECT RAISE(ABORT,'publication_requires_validated_transition'); END;
CREATE TRIGGER validate_evaluation_template_insert BEFORE INSERT ON evaluations
WHEN NOT EXISTS(SELECT 1 FROM template_versions WHERE id=NEW.template_version_id AND program_id=NEW.program_id) OR (SELECT role FROM users WHERE id=NEW.doctor_id) NOT IN('admin','doctor')
BEGIN SELECT RAISE(ABORT,'invalid_evaluation_template_or_actor'); END;
CREATE TRIGGER validate_evaluation_template_update BEFORE UPDATE ON evaluations
WHEN NOT EXISTS(SELECT 1 FROM template_versions WHERE id=NEW.template_version_id AND program_id=NEW.program_id) OR (SELECT role FROM users WHERE id=NEW.doctor_id) NOT IN('admin','doctor')
BEGIN SELECT RAISE(ABORT,'invalid_evaluation_template_or_actor'); END;
CREATE TRIGGER validate_publication BEFORE UPDATE OF status ON evaluations WHEN NEW.status='published'
BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM evaluation_questions WHERE evaluation_id=NEW.id)=0
 OR (SELECT count(*) FROM evaluation_questions WHERE evaluation_id=NEW.id)!=(SELECT count(*) FROM template_questions WHERE template_version_id=NEW.template_version_id)
 OR EXISTS(SELECT 1 FROM evaluation_questions WHERE evaluation_id=NEW.id AND score IS NULL)
 OR EXISTS(SELECT 1 FROM evaluation_questions q LEFT JOIN template_questions t ON t.template_version_id=NEW.template_version_id AND t.question_key=q.question_key WHERE q.evaluation_id=NEW.id AND (t.question_key IS NULL OR q.position!=t.position OR q.label_en!=t.label_en OR q.label_ar!=t.label_ar))
 OR abs(NEW.overall_score-(SELECT avg(score) FROM evaluation_questions WHERE evaluation_id=NEW.id))>0.000000001
 THEN RAISE(ABORT,'incomplete_or_invalid_publication') END;
END;
CREATE TRIGGER published_questions_insert BEFORE INSERT ON evaluation_questions WHEN (SELECT status FROM evaluations WHERE id=NEW.evaluation_id)='published' BEGIN SELECT RAISE(ABORT,'immutable_published_evaluation'); END;
CREATE TRIGGER published_questions_update BEFORE UPDATE ON evaluation_questions WHEN (SELECT status FROM evaluations WHERE id=OLD.evaluation_id)='published' OR (SELECT status FROM evaluations WHERE id=NEW.evaluation_id)='published' BEGIN SELECT RAISE(ABORT,'immutable_published_evaluation'); END;
CREATE TRIGGER published_questions_delete BEFORE DELETE ON evaluation_questions WHEN (SELECT status FROM evaluations WHERE id=OLD.evaluation_id)='published' BEGIN SELECT RAISE(ABORT,'immutable_published_evaluation'); END;
CREATE TRIGGER published_notes_insert BEFORE INSERT ON evaluation_notes WHEN (SELECT status FROM evaluations WHERE id=NEW.evaluation_id)='published' BEGIN SELECT RAISE(ABORT,'immutable_published_evaluation'); END;
CREATE TRIGGER published_notes_update BEFORE UPDATE ON evaluation_notes WHEN (SELECT status FROM evaluations WHERE id=OLD.evaluation_id)='published' OR (SELECT status FROM evaluations WHERE id=NEW.evaluation_id)='published' BEGIN SELECT RAISE(ABORT,'immutable_published_evaluation'); END;
CREATE TRIGGER published_notes_delete BEFORE DELETE ON evaluation_notes WHEN (SELECT status FROM evaluations WHERE id=OLD.evaluation_id)='published' BEGIN SELECT RAISE(ABORT,'immutable_published_evaluation'); END;
CREATE TRIGGER validate_head_insert BEFORE INSERT ON evaluation_heads WHEN NOT EXISTS(SELECT 1 FROM evaluations WHERE id=NEW.published_id AND resident_id=NEW.resident_id AND period=NEW.period AND status='published') BEGIN SELECT RAISE(ABORT,'invalid_publication_head'); END;
CREATE TRIGGER validate_head_update BEFORE UPDATE ON evaluation_heads WHEN NOT EXISTS(SELECT 1 FROM evaluations WHERE id=NEW.published_id AND resident_id=NEW.resident_id AND period=NEW.period AND status='published') BEGIN SELECT RAISE(ABORT,'invalid_publication_head'); END;

CREATE TABLE file_log (
  id TEXT PRIMARY KEY, resident_id TEXT NOT NULL REFERENCES resident_profiles(user_id),
  file_number TEXT NOT NULL CHECK(length(file_number) BETWEEN 1 AND 40),
  worked_date TEXT NOT NULL, created_at TEXT NOT NULL,
  reviewed_at TEXT, reviewed_by TEXT REFERENCES users(id), UNIQUE(resident_id,file_number)
);
CREATE INDEX file_log_resident_date ON file_log(resident_id,worked_date);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id), action TEXT NOT NULL,
  subject_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX audit_events_created ON audit_events(created_at);
CREATE TRIGGER immutable_audit_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'immutable_audit'); END;
CREATE TRIGGER immutable_audit_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'immutable_audit'); END;
CREATE TABLE rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, hits INTEGER NOT NULL CHECK(hits>0)
);
CREATE TABLE bootstrap_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), initialized_at TEXT NOT NULL);
CREATE TABLE transaction_guards (id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1));
