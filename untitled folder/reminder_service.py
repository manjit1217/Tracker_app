from __future__ import annotations

import logging
from datetime import date

from app.database import Database
from app.models import Reminder

LOGGER = logging.getLogger(__name__)


class ReminderService:
    def __init__(self, database: Database) -> None:
        self.database = database

    def generate_reminders(self) -> list[Reminder]:
        reminders: list[Reminder] = []
        return_rows, warranty_rows = self.database.get_due_reminders()

        for row in return_rows:
            due_date = date.fromisoformat(row["return_deadline"])
            reminder = Reminder(
                order_id=row["order_id"],
                product_name=row["product_name"],
                message=f"Return window closes soon for '{row['product_name']}' (Order: {row['order_id']}).",
                due_date=due_date,
                reminder_type="return_deadline",
            )
            reminders.append(reminder)
            LOGGER.info("Reminder generated: %s", reminder.message)

        for row in warranty_rows:
            due_date = date.fromisoformat(row["warranty_expiry"])
            reminder = Reminder(
                order_id=row["order_id"],
                product_name=row["product_name"],
                message=f"Warranty expires soon for '{row['product_name']}' (Order: {row['order_id']}).",
                due_date=due_date,
                reminder_type="warranty_expiry",
            )
            reminders.append(reminder)
            LOGGER.info("Reminder generated: %s", reminder.message)

        return reminders

    def send_console_reminders(self) -> None:
        reminders = self.generate_reminders()
        if not reminders:
            LOGGER.info("No reminders due today")
            return
        for reminder in reminders:
            print(
                f"[{reminder.reminder_type}] {reminder.message} "
                f"Due date: {reminder.due_date.isoformat()}"
            )
