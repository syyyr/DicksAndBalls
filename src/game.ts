import { Card, sameCards, Suit, getUnshuffledDeck } from './models/card'
import { Opponent, Player } from './models/player'
import { GameStateMessage, GameUpdateMessage, PlayerUpdateMessage } from './models/message'
import {
    isCardPlayedAction,
    isDrawAction,
    isSkippingTurnAction,
    PlayerAction
} from './models/playerAction'

class Game {
    private active = false
    private deck: Card[] = getUnshuffledDeck()
    private playedCards: Card[] = []
    private players: Player[] = []
    private playerOnTurn = 0

    private drawCount = 0 // keeps track of how many cards to draw when seven is played
    private skippingNextPlayer = false // keeps track whether the next player should skip a turn (if an ace is played)
    private changeColorTo?: Suit

    public getGameStateMessage(): GameStateMessage {
        const {active} = this
        return {
            type: 'game_state',
            active,
            players: this.getOpponents(),
        }
    }

    public getGameUpdateMessage(message: string): GameUpdateMessage {
        return {
            type: 'game_update',
            players: this.getOpponents(),
            deckTop: this.playedCards[0],
            message,
            playerOnTurn: this.players[this.playerOnTurn].name,
            changeColorTo: this.changeColorTo,
        }
    }

    public getPlayerMessage(playerId: string): PlayerUpdateMessage {
        const player = this.players.find((searchedPlayer) => searchedPlayer.id === playerId)
        if (!player) throw new Error(`Player ${playerId} is not present in the game`)

        return {
            type: 'player_update',
            cards: player.cards,
            winner: player.winner,
        }
    }

    public getAllPlayerMessages(): {playerId: string; message: PlayerUpdateMessage}[] {
        return this.players.map((player) => ({
            playerId: player.id,
            message: this.getPlayerMessage(player.id),
        }))
    }

    public addPlayer(newPlayer: Player): void {
        for (const player of this.players) {
            if (player.name === newPlayer.name) throw new Error('Player of this name already joined the game')
        }

        this.players.push(newPlayer)
        console.log('# Player added: ', newPlayer)
    }

    public removePlayer(playerId: string): void {
        const playerIndex = this.players.findIndex((player) => player.id === playerId)
        if (playerIndex !== -1) {
            console.log('# Player removed:', this.players[playerIndex])
            this.players.splice(playerIndex, 1)
            if (this.players.length < 2) this.stopGame()
        }
    }

    /**
     * Starts the game: shuffles the deck, distributes the cards, sets the game to active
     * Optional parameter for the player who shuffled the cards
     * @param playerId
     */
    public startGame(playerId?: string): void {
        if (this.active) throw new Error('The game has already started')
        if (this.players.length < 2) throw new Error('Not enough players')
        if (this.players.length > 6) throw new Error('Too many players')

        const shufflingPlayerIndex = this.players.findIndex((player => player.id === playerId))
        if (shufflingPlayerIndex !== -1 && this.players[shufflingPlayerIndex + 1]) {
            this.playerOnTurn = shufflingPlayerIndex + 1
        } else this.playerOnTurn = 0

        this.shuffle()
        this.distributeCardsToPlayers()
        this.playedCards = [this.deck[0]]
        this.deck.splice(0, 1)

        this.drawCount = this.playedCards[0].value === '7' ? 2 : 0
        this.skippingNextPlayer = this.playedCards[0].value === 'A';

        this.active = true
        console.log('# Game started!')
        this.logGame()
    }

    public stopGame(): void {
        console.log('# Game stopped!')
        this.active = false
    }

    public handlePlayersTurn(playerId: string, action: PlayerAction): void {
        const player = this.players.find((player => player.id === playerId))
        if (!player) throw new Error("Player not found")
        if (playerId !== this.players[this.playerOnTurn].id) throw new Error("It's not your turn")

        this.isValidMove(action)

        if (isCardPlayedAction(action)) {
            const playersCardIndex = player.cards.findIndex(card => sameCards(card, action.card))
            if (playersCardIndex === -1) throw new Error("You don't have this card")
            if (action.card.value === 'T' && !action.changeColorTo) throw new Error("You have to pick a color")

            this.playedCards.unshift(action.card)
            player.cards.splice(playersCardIndex, 1)

            if (this.changeColorTo !== null) this.changeColorTo = undefined
            if (action.card.value === '7') this.drawCount += 2
            else if (action.card.value === 'A') this.skippingNextPlayer = true
            else if (action.card.value === 'T') this.changeColorTo = action.changeColorTo
            console.log(`# Action: Player ${playerId} played ${action.card.suit} ${action.card.value}`)

            if (player.cards.length === 0) player.winner = true
        }
        else if (isDrawAction(action)) {
            if (this.drawCount > 0) {
                for (let i = 0; i < this.drawCount; i++) this.drawCard(player)
                this.drawCount = 0
            } else this.drawCard(player)
            console.log(`# Action: Player ${playerId} drew a card`)
        }
        else if (isSkippingTurnAction(action)) {
            this.skippingNextPlayer = false
            console.log(`# Action: Player ${playerId} skipped a turn`)
        }
        else throw new Error('Unknown player action')

        this.playerOnTurn++
        if (this.playerOnTurn >= this.players.length) this.playerOnTurn = 0

        this.logGame()
    }

    private drawCard(player: Player): void {
        if (this.deck.length === 0) { // TODO co kdyz dojdou karty
            console.log('# The deck was refilled')
            this.deck = [...(this.playedCards.slice(1))]
            this.playedCards = [this.playedCards[0]]
        }
        const card = this.deck.pop()
        if (!card) throw new Error('Cannot draw a card')
        player.cards.push(card)
    }

    private shuffle(): void {
        this.deck = getUnshuffledDeck()
        let currentIndex = this.deck.length, temporaryValue, randomIndex

        while (0 !== currentIndex) {
            randomIndex = Math.floor(Math.random() * currentIndex)
            currentIndex -= 1

            temporaryValue = this.deck[currentIndex]
            this.deck[currentIndex] = this.deck[randomIndex]
            this.deck[randomIndex] = temporaryValue
        }
        console.log('# Deck shuffled')
    }

    /**
     * Returns the list of players where cards are substituted by their count
     */
    private getOpponents(): Opponent[] {
        return this.players.map((player) => ({
            name: player.name,
            cards: player.cards.length,
            winner: player.winner,
        }))
    }

    /**
     * Distribute cards to players when the game is initialized
     * Every player gets four cards
     */
    private distributeCardsToPlayers(): void {
        for (const player of this.players) {
            player.cards = []
            player.cards.splice(0, 0, ...this.deck.slice(0, 4))
            this.deck.splice(0, 4)
        }
        console.log('# Cards distributed to players', this.players, this.deck)
    }

    private isValidMove(action: PlayerAction): void | never {
        if (isCardPlayedAction(action)) {
            if (this.changeColorTo) {
                if (action.card.suit !== this.changeColorTo) throw new Error(`The color was changed to ${this.changeColorTo}s`)
            }
            else if (this.playedCards[0].suit !== action.card.suit && this.playedCards[0].value !== action.card.value && action.card.value !== 'T') throw new Error("You can only play a card with the same color/value as the card on the deck")
            else if (this.skippingNextPlayer && action.card.value !== 'A') throw new Error("You cannot play a card when you're skipping a turn")
            else if (this.drawCount > 0 && action.card.value !== '7') throw new Error("You cannot play a card when you're supposed to draw")
        }
        else if (isDrawAction(action)) {
            if (this.skippingNextPlayer) throw new Error("You're skipping a turn, no need to draw")
        }
        else if (isSkippingTurnAction(action)) {
            if (!this.skippingNextPlayer) {
                if (this.playedCards[0].value === 'A') throw new Error("The previous player has already skipped a turn for this ace")
                else throw new Error("You cannot skip a turn if an ace wasn't played")
            }
        }
        else throw new Error('Unknown player action')

    }

    private logGame(): void {
        console.log('# Game changed:', `on turn: ${this.players[this.playerOnTurn].name}`, `drawCount: ${this.drawCount}`, `skippingTurn: ${this.skippingNextPlayer}`, this.players, this.deck, this.playedCards)
    }
}

export const game = new Game()