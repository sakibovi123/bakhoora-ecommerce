
from typing import Literal, NamedTuple

Action = Literal["view", "manage"]

VIEW: Action = "view"
MANAGE: Action = "manage"
ACTIONS: tuple[Action, ...] = (VIEW, MANAGE)


class Menu(NamedTuple):
    key: str
    label: str
    description: str


MENUS: tuple[Menu, ...] = (
    Menu("dashboard", "Dashboard", "Takings, best sellers and what needs attention"),
    Menu("orders", "Orders", "Read orders; managing moves them between statuses"),
    Menu("reports", "Sales reports", "Daily and monthly takings, broken down"),
    Menu("products", "Products", "The catalogue, its sizes, prices and stock"),
    Menu("categories", "Categories", "How the storefront groups products"),
    Menu("customers", "Customers", "Accounts, order history and access"),
    Menu("roles", "Roles & access", "Who may enter the panel and what they may touch"),
    Menu("expenses", "Expenses", "What the shop spends, and on what"),
    Menu("settings", "Settings", "Shop name, branding, currency, delivery and advance payment"),
)

MENU_KEYS: frozenset[str] = frozenset(menu.key for menu in MENUS)

CUSTOMER_ROLE_SLUG = "customer"
ADMIN_ROLE_SLUG = "admin"
SYSTEM_ROLE_SLUGS: frozenset[str] = frozenset({CUSTOMER_ROLE_SLUG, ADMIN_ROLE_SLUG})


def menu_label(key: str) -> str:
    for menu in MENUS:
        if menu.key == key:
            return menu.label
    return key
