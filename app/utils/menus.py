"""The admin panel's menus, and what a role may do inside each one.

This list is the contract between the API guards and the panel's sidebar. A
menu exists here first; the routes then guard themselves with it and the panel
renders whatever the signed-in role is allowed to see.
"""

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
    Menu("products", "Products", "The catalogue, its sizes, prices and stock"),
    Menu("categories", "Categories", "How the storefront groups products"),
    Menu("customers", "Customers", "Accounts, order history and access"),
    Menu("roles", "Roles & access", "Who may enter the panel and what they may touch"),
)

MENU_KEYS: frozenset[str] = frozenset(menu.key for menu in MENUS)

# Reserved slugs. Deleting or un-staffing either one would leave the shop with
# no customers or nobody able to open the panel.
CUSTOMER_ROLE_SLUG = "customer"
ADMIN_ROLE_SLUG = "admin"
SYSTEM_ROLE_SLUGS: frozenset[str] = frozenset({CUSTOMER_ROLE_SLUG, ADMIN_ROLE_SLUG})


def menu_label(key: str) -> str:
    for menu in MENUS:
        if menu.key == key:
            return menu.label
    return key
