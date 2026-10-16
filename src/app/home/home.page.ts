import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

interface City {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

interface GeocodingResponse {
  results?: City[];
}

interface CurrentWeather {
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  precipitation: number;
  weather_code: number;
  wind_speed_10m: number;
  time: string;
}

interface WeatherResponse {
  current: CurrentWeather;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    FormsModule,
    IonButton,
    IonContent,
    IonHeader,
    IonSearchbar,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class HomePage {
  private readonly changeDetector = inject(ChangeDetectorRef);
  cityQuery = '';
  cities: City[] = [];
  weather: WeatherResponse | null = null;
  selectedCity: City | null = null;
  searchingCities = false;
  loadingWeather = false;
  searched = false;
  errorMessage = '';
  private searchTimer?: ReturnType<typeof setTimeout>;
  private citySearchController?: AbortController;
  private weatherController?: AbortController;
  private readonly cityCache = new Map<string, City[]>();

  onCityQueryChange(query: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.citySearchController?.abort();
    this.searchingCities = false;
    this.errorMessage = '';
    this.cities = [];
    this.searched = false;

    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      this.cities = [];
      this.searched = false;
      return;
    }

    this.searchTimer = setTimeout(() => {
      void this.fetchCities(normalizedQuery);
    }, 300);
  }

  async searchCities(): Promise<void> {
    const query = this.cityQuery.trim();
    if (!query) {
      this.errorMessage = 'Escribe el nombre de una ciudad para buscarla.';
      this.cities = [];
      this.searched = false;
      return;
    }

    if (this.searchTimer) clearTimeout(this.searchTimer);
    await this.fetchCities(query);
  }

  private async fetchCities(query: string): Promise<void> {
    const cacheKey = query.toLocaleLowerCase();
    const cachedCities = this.cityCache.get(cacheKey);
    if (cachedCities) {
      this.cities = cachedCities;
      this.searched = true;
      this.searchingCities = false;
      this.changeDetector.markForCheck();
      return;
    }

    this.citySearchController?.abort();
    const controller = new AbortController();
    this.citySearchController = controller;
    this.searchingCities = true;
    this.errorMessage = '';
    this.changeDetector.markForCheck();
    try {
      const params = new URLSearchParams({
        name: query,
        count: '6',
        language: 'es',
        format: 'json',
      });
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?${params}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(`El servicio respondió con el estado ${response.status}.`);
      }

      const data = (await response.json()) as GeocodingResponse;
      if (this.citySearchController !== controller) return;
      this.cities = data.results ?? [];
      this.cityCache.set(cacheKey, this.cities);
      this.searched = true;
      this.changeDetector.markForCheck();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (this.citySearchController !== controller) return;
      this.errorMessage =
        error instanceof Error
          ? `No se pudieron buscar ciudades. ${error.message}`
          : 'No se pudieron buscar ciudades. Comprueba tu conexión e inténtalo de nuevo.';
      this.changeDetector.markForCheck();
    } finally {
      if (this.citySearchController === controller) {
        this.searchingCities = false;
        this.changeDetector.markForCheck();
      }
    }
  }

  async loadWeather(city: City): Promise<void> {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.citySearchController?.abort();
    this.searchingCities = false;
    this.weatherController?.abort();
    const controller = new AbortController();
    this.weatherController = controller;
    this.loadingWeather = true;
    this.errorMessage = '';
    this.weather = null;
    this.selectedCity = city;

    try {
      const params = new URLSearchParams({
        latitude: String(city.latitude),
        longitude: String(city.longitude),
        current:
          'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
        timezone: 'auto',
      });
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(`El servicio respondió con el estado ${response.status}.`);
      }

      const weather = (await response.json()) as WeatherResponse;
      if (this.weatherController !== controller) return;
      this.weather = weather;
      this.changeDetector.markForCheck();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (this.weatherController !== controller) return;
      this.errorMessage =
        error instanceof Error
          ? `No se pudo consultar el clima. ${error.message}`
          : 'No se pudo consultar el clima. Comprueba tu conexión e inténtalo de nuevo.';
      this.changeDetector.markForCheck();
    } finally {
      if (this.weatherController === controller) {
        this.loadingWeather = false;
        this.changeDetector.markForCheck();
      }
    }
  }

  weatherDescription(code: number): string {
    if (code === 0) return 'Despejado';
    if (code === 1) return 'Mayormente despejado';
    if (code === 2) return 'Parcialmente nublado';
    if (code === 3) return 'Nublado';
    if (code === 45 || code === 48) return 'Niebla';
    if ([51, 53, 55, 56, 57].includes(code)) return 'Llovizna';
    if ([61, 63, 65, 66, 67].includes(code)) return 'Lluvia';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Nieve';
    if ([80, 81, 82].includes(code)) return 'Chubascos';
    if ([95, 96, 99].includes(code)) return 'Tormenta';
    return 'Condición no disponible';
  }

  weatherEmoji(code: number): string {
    if (code === 0) return '☀️';
    if (code === 1 || code === 2) return '🌤️';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
      return '🌧️';
    }
    if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
    if ([95, 96, 99].includes(code)) return '⛈️';
    return '🌡️';
  }
}
