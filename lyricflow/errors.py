"""Application failures without dependencies on HTTP response types."""


class ValidationError(ValueError):
    pass


class JobNotFoundError(Exception):
    pass


class JobConflictError(Exception):
    pass


class JobBusyError(JobConflictError):
    def __init__(self, job_id):
        super().__init__("目前有一首歌曲正在處理，請完成或停止後再開始。")
        self.job_id = job_id


class ServiceClosedError(Exception):
    pass


class ProcessingError(Exception):
    """A known processing failure with a message suitable for the user."""
