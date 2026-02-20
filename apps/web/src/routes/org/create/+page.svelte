<script lang="ts">
	import { Button } from "@my-app/ui/components/button";
	import * as Card from "@my-app/ui/components/card";
	import { Input } from "@my-app/ui/components/input";
	import { Label } from "@my-app/ui/components/label";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";
	import { client, queryClient } from "$lib/orpc";

	let orgName = $state("");
	let pending = $state(false);
	let errorMessage = $state<string | null>(null);
	let consentChecked = $state(false);
	let scrolledToBottom = $state(false);

	const sessionQuery = authClient.useSession();

	$effect(() => {
		if ($sessionQuery.isPending) return;
		if (!$sessionQuery.data) {
			goto(
				`${resolve("/login")}?next=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
		}
	});

	const handleScroll = (e: Event) => {
		const target = e.target as HTMLElement;
		const threshold = 50;
		if (
			target.scrollHeight - target.scrollTop - target.clientHeight <
			threshold
		) {
			scrolledToBottom = true;
		}
	};

	const handleSubmit = async () => {
		const trimmedName = orgName.trim();
		if (!trimmedName) {
			errorMessage = "Название организации обязательно.";
			return;
		}

		if (!consentChecked) {
			errorMessage = "Необходимо принять договор оферты.";
			return;
		}

		pending = true;
		errorMessage = null;

		try {
			await client.consent.accept({
				consentTypes: ["service_agreement"],
			});

			const { error } = await authClient.organization.create({
				name: trimmedName,
				slug: trimmedName
					.toLowerCase()
					.replace(/[^a-zа-яё0-9]+/gu, "-")
					.replace(/^-+|-+$/g, ""),
			});

			if (error) {
				errorMessage =
					(error as { message?: string }).message ??
					"Не удалось создать организацию.";
				pending = false;
				return;
			}

			queryClient.invalidateQueries({ queryKey: ["organization"] });
			goto(resolve("/dashboard"));
		} catch (err) {
			errorMessage =
				err instanceof Error
					? err.message
					: "Произошла ошибка при создании организации.";
			pending = false;
		}
	};
</script>

<div class="mx-auto max-w-2xl px-6 py-10">
	<div class="mb-8 text-center">
		<h1 class="text-3xl font-bold">Создание организации</h1>
		<p class="mt-2 text-muted-foreground">
			Создайте организацию для управления вашими лодками и бронированиями
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Данные организации</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<Label for="org-name">Название организации</Label>
				<Input
					id="org-name"
					type="text"
					placeholder="Моя марина"
					value={orgName}
					oninput={(e: Event) => (orgName = (e.target as HTMLInputElement).value)}
				/>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="mt-6">
		<Card.Header>
			<Card.Title>Договор оказания услуг (оферта)</Card.Title>
			<Card.Description>
				Пожалуйста, прочитайте и примите договор перед созданием организации
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div
				class="h-80 overflow-y-auto rounded-md border bg-muted/30 p-4 text-sm leading-relaxed"
				onscroll={handleScroll}
			>
				<p class="mb-4 font-bold">Договор оказания услуг (оферта)</p>

				<p class="mb-3">
					Оферта регулирует отношения между Покупателем и Организатором, которые
					связаны с оказанием услуг по проведению Мероприятий.
				</p>

				<p class="mb-3">
					ИП Тараканов Д. М. (ИНН: 440102978758, ОГРНИП: 325440000017340) не
					является стороной по договору.
				</p>

				<p class="mb-3">
					Организатор предлагает Покупателю заключить договор оказания услуг по
					проведению Мероприятия, доступного к бронированию и оплате на Сервисе
					(Договор), на изложенных в оферте условиях.
				</p>

				<p class="mb-4 font-semibold">1. Акцепт</p>
				<p class="mb-3">
					1.1. До направления Заказа Покупатель должен внимательно ознакомиться
					с условиями Соглашения и Договора. Покупатель не вправе оформлять
					Заказ, если он не согласен с указанными документами.
				</p>
				<p class="mb-3">
					1.2. Договор считается заключенным (акцепт оферты) с момента, когда
					Покупатель отправил Заказ Организатору через Сервис.
				</p>

				<p class="mb-4 font-semibold">2. Предмет</p>
				<p class="mb-3">
					2.1. Организатор обязуется оказать услуги по проведению Мероприятия
					(Услуги) в соответствии с Заказом, а Покупатель обязуется принять и
					оплатить Услуги.
				</p>

				<p class="mb-4 font-semibold">3. Финансовые условия</p>
				<p class="mb-3">
					3.1. Стоимость Билета на Мероприятие указана на Странице Экскурсии.
				</p>
				<p class="mb-3">3.5.1. предоплата в размере 100% стоимости Заказа;</p>

				<p class="mb-4 font-semibold">4. Отмена и возврат</p>
				<p class="mb-3">
					4.1. Покупатель вправе отменить Заказ не менее чем за 24 часа до
					начала Мероприятия.
				</p>
				<p class="mb-3">
					4.2. Возврат денежных средств осуществляется в течение 10 рабочих
					дней.
				</p>

				<p class="mb-4 font-semibold">5. Ответственность</p>
				<p class="mb-3">
					5.1. Каждая из сторон несет ответственность за ненадлежащее исполнение
					своих обязательств в соответствии с действующим законодательством РФ.
				</p>

				<p class="mb-4 font-semibold">6. Персональные данные</p>
				<p class="mb-3">
					6.1. Обработка персональных данных осуществляется в соответствии с
					Политикой конфиденциальности и Федеральным законом «О персональных
					данных» № 152-ФЗ.
				</p>

				<p class="mb-4 font-semibold">7. Заключительные положения</p>
				<p class="mb-3">
					7.1. Все споры разрешаются путём переговоров, а при невозможности
					достижения согласия — в Арбитражном суде Санкт-Петербурга и
					Ленинградской области.
				</p>

				<p class="mt-6 text-xs text-muted-foreground">
					Полный текст договора доступен по запросу. Версия документа:
					2026-02-14.
				</p>
			</div>

			<label class="flex items-start gap-3 cursor-pointer select-none">
				<input
					type="checkbox"
					class="mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary"
					checked={consentChecked}
					disabled={!scrolledToBottom}
					onchange={(e) => (consentChecked = (e.target as HTMLInputElement).checked)}
				>
				<span class="text-sm">
					{#if !scrolledToBottom}
						<span class="text-muted-foreground">
							Прокрутите документ до конца, чтобы принять условия
						</span>
					{:else}
						Я ознакомился(-ась) и принимаю условия
						<span class="font-medium">Договора оказания услуг (оферты)</span>
					{/if}
				</span>
			</label>

			{#if errorMessage}
				<p class="text-sm text-destructive">{errorMessage}</p>
			{/if}
		</Card.Content>
		<Card.Footer>
			<Button
				onclick={() => void handleSubmit()}
				disabled={pending || !consentChecked || !orgName.trim()}
				class="w-full"
			>
				{pending ? "Создание..." : "Создать организацию"}
			</Button>
		</Card.Footer>
	</Card.Root>
</div>
