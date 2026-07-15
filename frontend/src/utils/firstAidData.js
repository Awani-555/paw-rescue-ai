export const firstAidData = [
  {
    id: 'dog-mild',
    species: 'Dog',
    situation: 'Minor injuries or distress',
    severity: 'mild',
    immediateSteps: [
      'Keep the animal calm and speak softly',
      'Offer water in a shallow bowl',
      'Keep the animal in the shade or a cool spot',
    ],
    doNot: ['Do not feed solid food', 'Do not force the animal to move'],
    callImmediately: false,
  },
  {
    id: 'dog-injured-limb',
    species: 'Dog',
    situation: 'Injured or broken limb',
    severity: 'urgent',
    immediateSteps: [
      'Do not move the animal unless it is in immediate danger',
      'Improvise a splint with a straight stick and soft cloth if you must move it',
      'Keep the limb as still as possible during transport',
    ],
    doNot: ['Do not try to straighten the limb', 'Do not apply pressure directly on the injury'],
    callImmediately: true,
  },
  {
    id: 'dog-unconscious',
    species: 'Dog',
    situation: 'Unconscious or unresponsive',
    severity: 'critical',
    immediateSteps: [
      'Check for breathing by watching the chest rise and fall',
      'Place gently in the recovery position, on its side with head extended',
      'Keep the airway clear',
    ],
    doNot: ['Do not give water or food', 'Do not shake or shout at the animal'],
    callImmediately: true,
  },
  {
    id: 'cat-injured',
    species: 'Cat',
    situation: 'Visible injury and high stress',
    severity: 'urgent',
    immediateSteps: [
      'Wrap the cat loosely in a towel to reduce stress and prevent scratching',
      'Handle as little as possible',
      'Place in a covered carrier or box for transport',
    ],
    doNot: ['Do not restrain forcefully', 'Do not remove the towel to inspect repeatedly'],
    callImmediately: true,
  },
  {
    id: 'cat-bleeding',
    species: 'Cat',
    situation: 'Active bleeding',
    severity: 'critical',
    immediateSteps: [
      'Apply gentle, steady pressure with a clean cloth over the wound',
      'Do not remove the cloth even if it soaks through, add another layer on top instead',
      'Keep the cat warm and still during transport',
    ],
    doNot: ['Do not remove the cloth to check the wound', 'Do not use antiseptic or powder on the wound'],
    callImmediately: true,
  },
  {
    id: 'bird-fallen',
    species: 'Bird',
    situation: 'Fallen from nest, featherless or partly feathered',
    severity: 'mild',
    immediateSteps: [
      'Place the bird in a ventilated cardboard box with air holes',
      'Line the box with a soft cloth, keep it dark and quiet',
      'Keep the box at room temperature, away from drafts',
    ],
    doNot: ['Do not force feed or give water', 'Do not handle more than necessary'],
    callImmediately: false,
  },
  {
    id: 'bird-stunned',
    species: 'Bird',
    situation: 'Stunned after hitting a window or surface',
    severity: 'mild',
    immediateSteps: [
      'Leave the bird undisturbed in a safe, quiet spot for about an hour',
      'If it must be moved, use a soft cloth and a ventilated box',
      'Check back after an hour. Most birds recover and fly off on their own',
    ],
    doNot: ['Do not try to force the bird to fly', 'Do not give water directly into the beak'],
    callImmediately: false,
  },
  {
    id: 'any-vehicle',
    species: 'Any',
    situation: 'Hit by a vehicle',
    severity: 'critical',
    immediateSteps: [
      'Do not move the animal’s spine or neck unnecessarily',
      'Keep the animal warm using a blanket or cloth',
      'Call for help immediately. This needs professional care fast',
    ],
    doNot: ['Do not lift by the middle of the body', 'Do not give food or water'],
    callImmediately: true,
  },
  {
    id: 'any-seizure',
    species: 'Any',
    situation: 'Having a seizure',
    severity: 'critical',
    immediateSteps: [
      'Clear the area of furniture, stairs, or other hazards',
      'Time the seizure from start to finish',
      'Stay nearby and keep the space quiet and dim',
    ],
    doNot: ['Do not restrain the animal', 'Do not put your hands near its mouth'],
    callImmediately: true,
  },
  {
    id: 'any-choking',
    species: 'Any',
    situation: 'Choking or struggling to breathe',
    severity: 'critical',
    immediateSteps: [
      'Stay calm and keep the animal as still as possible',
      'Transport to the nearest vet or facility immediately',
      'Do not delay. Every minute matters',
    ],
    doNot: ['Do not put your hand inside the mouth', 'Do not attempt home remedies'],
    callImmediately: true,
  },
]

export function filterFirstAid(data, { species = 'All', query = '' } = {}) {
  const q = query.trim().toLowerCase()
  return data.filter((entry) => {
    const matchesSpecies = species === 'All' || entry.species === species
    const matchesQuery =
      !q ||
      entry.situation.toLowerCase().includes(q) ||
      entry.species.toLowerCase().includes(q)
    return matchesSpecies && matchesQuery
  })
}
