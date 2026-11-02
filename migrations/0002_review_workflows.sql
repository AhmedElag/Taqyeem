PRAGMA foreign_keys = ON;

ALTER TABLE resident_profiles ADD COLUMN review_interval_weeks INTEGER NOT NULL DEFAULT 4 CHECK(typeof(review_interval_weeks)='integer' AND review_interval_weeks BETWEEN 1 AND 52);
ALTER TABLE file_log ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE file_log ADD COLUMN needs_recheck INTEGER NOT NULL DEFAULT 0 CHECK(needs_recheck IN(0,1));
ALTER TABLE evaluations ADD COLUMN review_required INTEGER NOT NULL DEFAULT 0 CHECK(review_required IN(0,1));

CREATE TABLE file_corrections (
  id TEXT PRIMARY KEY, file_id TEXT NOT NULL REFERENCES file_log(id),
  previous_number TEXT NOT NULL, file_number TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version>1), was_reviewed INTEGER NOT NULL CHECK(was_reviewed IN(0,1)),
  changed_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  UNIQUE(file_id,version)
);
CREATE TRIGGER immutable_file_correction_update BEFORE UPDATE ON file_corrections BEGIN SELECT RAISE(ABORT,'immutable_file_correction'); END;
CREATE TRIGGER immutable_file_correction_delete BEFORE DELETE ON file_corrections BEGIN SELECT RAISE(ABORT,'immutable_file_correction'); END;

CREATE TABLE observations (
  id TEXT PRIMARY KEY, resident_id TEXT NOT NULL REFERENCES resident_profiles(user_id),
  doctor_id TEXT NOT NULL REFERENCES users(id),
  text_en TEXT NOT NULL DEFAULT '' CHECK(length(text_en)<=1500),
  text_ar TEXT NOT NULL DEFAULT '' CHECK(length(text_ar)<=1500),
  created_at TEXT NOT NULL, CHECK(length(trim(text_en))+length(trim(text_ar))>0)
);
CREATE INDEX observations_resident ON observations(resident_id,created_at);
CREATE TRIGGER immutable_observation_update BEFORE UPDATE ON observations BEGIN SELECT RAISE(ABORT,'immutable_observation'); END;
CREATE TRIGGER immutable_observation_delete BEFORE DELETE ON observations BEGIN SELECT RAISE(ABORT,'immutable_observation'); END;

CREATE TABLE teaching_goals (
  id TEXT PRIMARY KEY, resident_id TEXT NOT NULL REFERENCES resident_profiles(user_id),
  doctor_id TEXT NOT NULL REFERENCES users(id),
  text_en TEXT NOT NULL DEFAULT '' CHECK(length(text_en)<=1500),
  text_ar TEXT NOT NULL DEFAULT '' CHECK(length(text_ar)<=1500),
  created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT REFERENCES users(id),
  CHECK(length(trim(text_en))+length(trim(text_ar))>0),
  CHECK((reviewed_at IS NULL AND reviewed_by IS NULL) OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
CREATE UNIQUE INDEX one_open_teaching_goal ON teaching_goals(resident_id) WHERE reviewed_at IS NULL;
CREATE TRIGGER immutable_goal_content BEFORE UPDATE OF resident_id,doctor_id,text_en,text_ar,created_at ON teaching_goals BEGIN SELECT RAISE(ABORT,'immutable_goal'); END;
CREATE TRIGGER immutable_reviewed_goal BEFORE UPDATE ON teaching_goals WHEN OLD.reviewed_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'immutable_goal'); END;
CREATE TRIGGER immutable_goal_delete BEFORE DELETE ON teaching_goals BEGIN SELECT RAISE(ABORT,'immutable_goal'); END;

CREATE TABLE evaluation_reviews (
  id TEXT PRIMARY KEY, evaluation_id TEXT NOT NULL REFERENCES evaluations(id),
  resident_id TEXT NOT NULL REFERENCES resident_profiles(user_id),
  from_doctor_id TEXT NOT NULL REFERENCES users(id), to_doctor_id TEXT NOT NULL REFERENCES users(id),
  evaluation_version INTEGER NOT NULL, resident_record_version INTEGER NOT NULL,
  template_version_id TEXT NOT NULL REFERENCES template_versions(id),
  base_published_id TEXT REFERENCES evaluations(id),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','changes_requested','cancelled','superseded')),
  comment_en TEXT NOT NULL DEFAULT '' CHECK(length(comment_en)<=1500),
  comment_ar TEXT NOT NULL DEFAULT '' CHECK(length(comment_ar)<=1500),
  created_at TEXT NOT NULL, reviewed_at TEXT, closed_at TEXT,
  CHECK(from_doctor_id!=to_doctor_id)
);
CREATE UNIQUE INDEX one_current_evaluation_review ON evaluation_reviews(evaluation_id) WHERE status IN('pending','approved','changes_requested');
CREATE INDEX evaluation_review_recipient ON evaluation_reviews(to_doctor_id,status,created_at);
CREATE INDEX evaluation_review_sender ON evaluation_reviews(from_doctor_id,created_at);
CREATE TRIGGER immutable_review_snapshot BEFORE UPDATE OF evaluation_id,resident_id,from_doctor_id,to_doctor_id,evaluation_version,resident_record_version,template_version_id,base_published_id,snapshot_json,created_at ON evaluation_reviews BEGIN SELECT RAISE(ABORT,'immutable_review_snapshot'); END;
CREATE TRIGGER immutable_review_delete BEFORE DELETE ON evaluation_reviews BEGIN SELECT RAISE(ABORT,'immutable_review'); END;
CREATE TRIGGER valid_review_transition BEFORE UPDATE OF status ON evaluation_reviews
WHEN NOT ((OLD.status='pending' AND NEW.status IN('approved','changes_requested','cancelled','superseded')) OR (OLD.status IN('approved','changes_requested') AND NEW.status IN('cancelled','superseded')) OR (OLD.status='superseded' AND NEW.status='cancelled'))
BEGIN SELECT RAISE(ABORT,'invalid_review_transition'); END;

INSERT INTO schema_meta VALUES(2,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
