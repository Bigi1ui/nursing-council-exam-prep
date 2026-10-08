alter table public.practice_sessions
	drop constraint if exists practice_sessions_mock_exam_time_limit_check;

alter table public.practice_sessions
	add constraint practice_sessions_mock_exam_time_limit_check
	check (
		question_set <> 'mock_exam'
		or (
			time_limit_seconds is not null
			and time_limit_seconds in (3600, 5400, 7200, 10800, 14400)
		)
	);
