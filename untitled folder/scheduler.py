from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.reminder_service import ReminderService

LOGGER = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self, reminder_service: ReminderService, timezone: str) -> None:
        self.reminder_service = reminder_service
        self.scheduler = BackgroundScheduler(timezone=timezone)

    def start(self) -> None:
        self.scheduler.add_job(
            self.reminder_service.send_console_reminders,
            trigger=CronTrigger(hour=9, minute=0),
            id="daily-reminders",
            replace_existing=True,
        )
        self.scheduler.start()
        LOGGER.info("Scheduler started for daily reminders at 09:00")

    def stop(self) -> None:
        self.scheduler.shutdown(wait=False)
        LOGGER.info("Scheduler stopped")
