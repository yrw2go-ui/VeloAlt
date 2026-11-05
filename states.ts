// US states (plus DC) for "where you live" — shared by Settings and the server.
export const US_STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "Outside the US"] as const;

// Time zones a character can live in (shown by a friendly name).
export const CHARACTER_ZONES: [string, string][] = [
  ["", "Same as the user"],
  ["America/New_York", "US Eastern (New York)"], ["America/Chicago", "US Central (Chicago)"], ["America/Denver", "US Mountain (Denver)"],
  ["America/Phoenix", "Arizona (Phoenix)"], ["America/Los_Angeles", "US Pacific (Los Angeles)"], ["America/Anchorage", "Alaska"], ["Pacific/Honolulu", "Hawaii"],
  ["America/Toronto", "Toronto"], ["America/Mexico_City", "Mexico City"], ["America/Sao_Paulo", "São Paulo"], ["Europe/London", "London"], ["Europe/Dublin", "Dublin"],
  ["Europe/Paris", "Paris"], ["Europe/Berlin", "Berlin"], ["Europe/Madrid", "Madrid"], ["Europe/Rome", "Rome"], ["Europe/Stockholm", "Stockholm"], ["Europe/Moscow", "Moscow"],
  ["Africa/Lagos", "Lagos"], ["Africa/Johannesburg", "Johannesburg"], ["Asia/Dubai", "Dubai"], ["Asia/Kolkata", "India"], ["Asia/Bangkok", "Bangkok"],
  ["Asia/Singapore", "Singapore"], ["Asia/Manila", "Manila"], ["Asia/Shanghai", "Shanghai"], ["Asia/Seoul", "Seoul"], ["Asia/Tokyo", "Tokyo"],
  ["Australia/Sydney", "Sydney"], ["Pacific/Auckland", "Auckland"],
];
