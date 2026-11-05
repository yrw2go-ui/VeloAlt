-- 🛒 Amazon carts Velo puts together (Velo Pro). Nothing is bought: the card
-- opens the cart on Amazon and the person checks out there themselves.
alter table velo_actions drop constraint if exists velo_actions_kind_check;
alter table velo_actions add constraint velo_actions_kind_check check (kind in ('text', 'call', 'inbound', 'post', 'cart'));
